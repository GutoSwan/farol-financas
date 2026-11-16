import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'
import type { QaBillRepository } from '../src/domain/repositories/QaBillRepository.js'
import { StaleFinancialRecordError } from '../src/domain/errors/StaleFinancialRecordError.js'

const qaSpace = '01c6765f-b873-420f-a5f2-68c54aa22500'
const otherSpace = '33333333-3333-4333-8333-333333333333'
const billId = '55555555-5555-4555-8555-555555555555'
const owner = '11111111-1111-4111-8111-111111111111'
const viewer = '22222222-2222-4222-8222-222222222222'
const outsider = '44444444-4444-4444-8444-444444444444'
const endpoint = '/api/v1/qa-bill-write'
const bill = { id: billId, workspaceId: qaSpace, name: 'Luz QA', dueDay: 10, active: true, version: 2, entries: [] }

function fixture(enabled = true) {
  const calls: string[] = []
  const repo: WorkspaceRepository = {
    async listForUser(id) {
      if (id === owner) return [
        { id: qaSpace, name: 'QA - Casa compartilhada (Dev)', role: 'OWNER' },
        { id: otherSpace, name: 'Real', role: 'OWNER' },
      ]
      if (id === viewer) return [{ id: qaSpace, name: 'QA - Casa compartilhada (Dev)', role: 'VIEWER' }]
      return []
    },
    async createOwnedBy() { throw new Error('unused') },
    async hasMembership(id, workspaceId, roles = []) {
      const role = id === owner ? 'OWNER' : id === viewer ? 'VIEWER' : undefined
      return !!role && [qaSpace, otherSpace].includes(workspaceId) && (!roles.length || roles.includes(role))
    },
  }
  const writer: QaBillRepository = {
    async create(workspaceId, input) { calls.push('create:' + workspaceId + ':' + input.dueDay); return bill },
    async update(workspaceId, id, version) {
      calls.push('update:' + workspaceId + ':' + id + ':' + version)
      if (version === 99) throw new StaleFinancialRecordError()
      return bill
    },
    async upsertMonth(workspaceId, id, version, input) {
      calls.push('month:' + workspaceId + ':' + id + ':' + version + ':' + input.yearMonth + ':' + input.amountCents + ':' + input.status)
      return bill
    },
    async removeMonth(workspaceId, id, version, month) {
      calls.push('removeMonth:' + workspaceId + ':' + id + ':' + version + ':' + month)
      return bill
    },
    async delete(workspaceId, id, version) {
      calls.push('delete:' + workspaceId + ':' + id + ':' + version)
      return true
    },
  }
  const app = buildApp({
    auth: { async verifyAccessToken(token) {
      const userId = token === 'owner' ? owner : token === 'viewer' ? viewer : token === 'outsider' ? outsider : ''
      if (!userId) throw new Error('invalid token')
      return { userId, assuranceLevel: 'aal2' as const }
    } },
    workspaceService: new WorkspaceService(repo),
    qaBillRepository: writer, allowQaBillWrites: enabled,
    allowWorkspaceWrites: false,
    checkDatabase: async () => true,
  })
  const request = (payload: unknown, token = 'owner', version?: number) =>
    app.inject({
      method: 'POST', url: endpoint,
      headers: { authorization: 'Bearer ' + token, ...(version ? { 'if-match': '"' + version + '"' } : {}) },
      payload,
    })
  return { app, calls, request }
}

describe('Contas mensais QA: guarda de espaço, sessão e versão', () => {
  it('não escreve sem JWT ou com token inválido', async () => {
    const { app, calls } = fixture()
    try {
      for (const token of ['', 'bad']) {
        const response = await app.inject({
          method: 'POST', url: endpoint,
          ...(token ? { headers: { authorization: 'Bearer ' + token } } : {}),
          payload: { action: 'create', workspaceId: qaSpace, input: { name: 'QA', dueDay: 10 } },
        })
        expect(response.statusCode).toBe(401)
      }
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })
  it('bloqueia completamente a rota quando flag de escrita QA está desligada', async () => {
    const { app, request, calls } = fixture(false)
    try {
      expect((await request({ action: 'create', workspaceId: qaSpace, input: { name: 'QA', dueDay: 10 } })).statusCode).toBe(403)
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })
  it('bloqueia workspace real, VIEWER e usuário de fora mesmo com UUID conhecido', async () => {
    const { app, request, calls } = fixture()
    try {
      const command = { action: 'create', workspaceId: qaSpace, input: { name: 'QA', dueDay: 10 } }
      expect((await request({ ...command, workspaceId: otherSpace })).statusCode).toBe(404)
      expect((await request(command, 'viewer')).statusCode).toBe(404)
      expect((await request(command, 'outsider')).statusCode).toBe(404)
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })
  it('cria cadastro QA apenas para OWNER/EDITOR autorizado', async () => {
    const { app, request, calls } = fixture()
    try {
      const response = await request({ action: 'create', workspaceId: qaSpace, input: { name: 'Luz QA', dueDay: 10 } })
      expect(response.statusCode).toBe(201)
      expect(response.json().data).toMatchObject(bill)
      expect(calls).toEqual(['create:' + qaSpace + ':10'])
    } finally { await app.close() }
  })
  it('exige versão para edição, alteração mensal e exclusão', async () => {
    const { app, request, calls } = fixture()
    try {
      for (const command of [
        { action: 'update', workspaceId: qaSpace, billId, input: { name: 'Novo' } },
        { action: 'upsert-month', workspaceId: qaSpace, billId, input: { yearMonth: '2026-11', amountCents: 1234, status: 'PENDING' } },
        { action: 'delete-month', workspaceId: qaSpace, billId, yearMonth: '2026-11' },
        { action: 'delete', workspaceId: qaSpace, billId },
      ]) expect((await request(command)).statusCode).toBe(428)
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })
  it('edita valor e pagamento, remove somente o mês e exclui cadastro', async () => {
    const { app, request, calls } = fixture()
    try {
      expect((await request({ action: 'update', workspaceId: qaSpace, billId, input: { name: 'Água' } }, 'owner', 2)).statusCode).toBe(200)
      expect((await request({
        action: 'upsert-month', workspaceId: qaSpace, billId,
        input: { yearMonth: '2026-11', amountCents: 1234, status: 'PAID' },
      }, 'owner', 2)).statusCode).toBe(200)
      expect((await request({ action: 'delete-month', workspaceId: qaSpace, billId, yearMonth: '2026-11' }, 'owner', 2)).statusCode).toBe(200)
      expect((await request({ action: 'delete', workspaceId: qaSpace, billId }, 'owner', 2)).statusCode).toBe(204)
      expect(calls).toHaveLength(4)
      expect(calls[1]).toContain(':2026-11:1234:PAID')
    } finally { await app.close() }
  })
  it('responde conflito 409 ao tentar gravar versão obsoleta', async () => {
    const { app, request, calls } = fixture()
    try {
      const response = await request({ action: 'update', workspaceId: qaSpace, billId, input: { dueDay: 12 } }, 'owner', 99)
      expect(response.statusCode).toBe(409)
      expect(response.json().code).toBe('VERSION_CONFLICT')
      expect(calls).toHaveLength(1)
    } finally { await app.close() }
  })
  it('rejeita dados malformados e campos extras sem chamar o banco', async () => {
    const { app, request, calls } = fixture()
    try {
      for (const command of [
        { action: 'create', workspaceId: qaSpace, input: { name: '', dueDay: 38 } },
        { action: 'create', workspaceId: qaSpace, input: { name: 'Falsa', dueDay: 10, workspaceId: otherSpace } },
        { action: 'upsert-month', workspaceId: qaSpace, billId, input: { yearMonth: '2026-13', amountCents: -10, status: 'PENDING' } },
      ]) expect((await request(command, 'owner', 2)).statusCode).toBe(400)
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })
})
