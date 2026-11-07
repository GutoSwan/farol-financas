import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'
import type { InvoiceRepository, NewInvoice } from '../src/domain/repositories/InvoiceRepository.js'
const workspaceId = '33333333-3333-4333-8333-333333333333'
const ownerId = '11111111-1111-4111-8111-111111111111'
const viewerId = '44444444-4444-4444-8444-444444444444'
const outsiderId = '22222222-2222-4222-8222-222222222222'
const url = '/api/v1/workspaces/' + workspaceId + '/invoices'
const pdfBase64 = Buffer.from('%PDF-1.7\n%%EOF\n').toString('base64')
const body = {
  billingMonth: '2026-11', issuer: 'Banco Teste', totalCents: 85000,
  dueDate: '2026-11-20', cardLast4: '1234', pdfBase64,
}
function fixture(writes = false, uploads = false) {
  const calls: Array<{ op: string; workspace?: string; user?: string; input?: NewInvoice }> = []
  const workspaces: WorkspaceRepository = {
    async listForUser() { return [] },
    async createOwnedBy() { throw Error('not-used') },
    async hasMembership(userId, workspace, roles = []) {
      const role = userId === ownerId ? 'OWNER' : userId === viewerId ? 'VIEWER' : undefined
      return workspace === workspaceId && !!role && (!roles.length || roles.includes(role))
    },
  }
  const invoiceRepository: InvoiceRepository = {
    async listPersonal(workspace,user) {
      calls.push({ op:'list', workspace, user })
      return []
    },
    async create(input) {
      calls.push({ op:'create', input })
      return { id:input.id, billingMonth:input.billingMonth, state:'QUARANTINED', scanStatus:'PENDING', createdAt:new Date().toISOString() }
    },
  }
  const app = buildApp({
    workspaceService: new WorkspaceService(workspaces),
    invoiceRepository,
    auth: { async verifyAccessToken(token) {
      const name = token.split(':')[0]
      const userId = name === 'owner' ? ownerId : name === 'viewer' ? viewerId : name === 'outsider' ? outsiderId : ''
      if (!userId) throw Error('Invalid token')
      return { userId, assuranceLevel: token.endsWith(':aal2') ? 'aal2' as const : 'aal1' as const }
    }},
    checkDatabase: async () => true,
    allowWorkspaceWrites: writes, allowInvoiceUploads: uploads,
  })
  return { app, calls }
}
const auth = (token: string) => ({ authorization:'Bearer ' + token })
describe('Faturas: isolamento pessoal, MFA e upload fechado por padrão', () => {
 it('não lista faturas sem autenticação', async () => {
  const {app,calls}=fixture()
  try {
    expect((await app.inject({method:'GET',url})).statusCode).toBe(401)
    expect(calls).toHaveLength(0)
  } finally { await app.close() }
 })
 it('rejeita leitura e upload do workspace alheio', async () => {
  const {app,calls}=fixture(true,true)
  try {
    const headers=auth('outsider:aal2')
    expect((await app.inject({method:'GET',url,headers})).statusCode).toBe(404)
    expect((await app.inject({method:'POST',url,headers,payload:body})).statusCode).toBe(404)
    expect(calls).toHaveLength(0)
  } finally { await app.close() }
 })
 it('MFA obrigatório para consulta e envio', async () => {
  const {app,calls}=fixture(true,true)
  try {
    const headers=auth('owner:aal1')
    expect((await app.inject({method:'GET',url,headers})).statusCode).toBe(403)
    expect((await app.inject({method:'POST',url,headers,payload:body})).statusCode).toBe(403)
    expect(calls).toHaveLength(0)
  } finally { await app.close() }
 })
 it('VIEWER pode listar apenas suas próprias faturas, nunca enviar', async () => {
  const {app,calls}=fixture(true,true)
  try {
    expect((await app.inject({method:'GET',url,headers:auth('viewer:aal2')})).statusCode).toBe(200)
    expect((await app.inject({method:'POST',url,headers:auth('viewer:aal2'),payload:body})).statusCode).toBe(404)
    expect(calls).toEqual([{op:'list',workspace:workspaceId,user:viewerId}])
  } finally { await app.close() }
 })
 it('nenhum envio sem as duas liberações explícitas', async () => {
  for(const flags of [[false,false],[false,true],[true,false]] as const) {
    const {app,calls}=fixture(...flags)
    try {
      expect((await app.inject({method:'POST',url,headers:auth('owner:aal2'),payload:body})).statusCode).toBe(403)
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  }
 })
 it('rejeita arquivo inválido ou campos externos', async () => {
  const {app,calls}=fixture(true,true)
  try {
    const headers=auth('owner:aal2')
    for(const payload of [{...body,pdfBase64:'bm90LXBERi0='},{...body,cardNumber:'4111111111111111'},{...body,totalCents:-1}]) {
      expect((await app.inject({method:'POST',url,headers,payload})).statusCode).toBe(400)
    }
    expect(calls).toHaveLength(0)
  } finally { await app.close() }
 })
 it('owner autorizado recebe status 202, com fatura em quarentena', async () => {
  const {app,calls}=fixture(true,true)
  try {
    const res=await app.inject({method:'POST',url,headers:auth('owner:aal2'),payload:body})
    expect(res.statusCode).toBe(202)
    expect(res.headers['cache-control']).toContain('no-store')
    expect(res.json().data).toMatchObject({state:'QUARANTINED',scanStatus:'PENDING'})
    expect(calls).toHaveLength(1)
    expect(calls[0].input?.workspaceId).toBe(workspaceId)
    expect(calls[0].input?.uploadedBy).toBe(ownerId)
    expect(calls[0].input?.pdfBytes.toString('ascii')).toContain('%PDF-')
    expect(res.body).not.toContain('Banco Teste')
  } finally { await app.close() }
 })
})
