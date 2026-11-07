import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRole } from '../src/domain/entities/Workspace.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'
import type { TransactionRepository, TransactionEntry } from '../src/domain/repositories/TransactionRepository.js'

const spaceId = '33333333-3333-4333-8333-333333333333'
const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const viewer = '44444444-4444-4444-8444-444444444444'
const record: TransactionEntry = {
  id: '55555555-5555-4555-8555-555555555555', workspaceId: spaceId,
  description: 'Mercado', category: 'Alimentos', amountCents: 12999, kind: 'EXPENSE',
  occurredOn: '2026-11-07',
}

function fixture(write = true) {
  const calls: string[] = []
  const memberships: Record<string, WorkspaceRole | undefined> = {
    [alice]: 'OWNER', [viewer]: 'VIEWER',
  }
  const repository: WorkspaceRepository = {
    async listForUser() { return [] },
    async createOwnedBy() { throw new Error('not used') },
    async hasMembership(userId, workspaceId, roles = []) {
      return workspaceId === spaceId && !!memberships[userId] &&
        (!roles.length || roles.includes(memberships[userId]!))
    },
  }
  const transactions: TransactionRepository = {
    async listForWorkspace(workspaceId) {
      calls.push('list:' + workspaceId)
      return [record]
    },
    async createForWorkspace(item) {
      calls.push('create:' + item.workspaceId)
      return { ...record, ...item }
    },
  }
  const app = buildApp({
    auth: {
      async verifyAccessToken(token) {
        const [name, aal] = token.split(':')
        const userId = name === 'alice' ? alice : name === 'bob' ? bob : name === 'viewer' ? viewer : ''
        if (!userId) throw new Error('invalid token')
        return { userId, assuranceLevel: aal === 'aal2' ? 'aal2' as const : 'aal1' as const }
      },
    },
    workspaceService: new WorkspaceService(repository),
    transactionRepository: transactions,
    allowWorkspaceWrites: write,
    checkDatabase: async () => true,
  })
  return { app, calls }
}
const url = '/api/v1/workspaces/' + spaceId + '/transactions'
const payload = { description: 'Mercado', category: 'Alimentos', amountCents: 12999, kind: 'EXPENSE', occurredOn: '2026-11-07' }

describe('Transações: isolamento e permissão por operação', () => {
  it('nega consulta anônima', async () => {
    const { app, calls } = fixture()
    try {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode).toBe(401)
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })
  it('nega leitura de espaço alheio mesmo com UUID conhecido', async () => {
    const { app, calls } = fixture()
    try {
      const response = await app.inject({ method: 'GET', url, headers: { authorization: 'Bearer bob:aal2' } })
      expect(response.statusCode).toBe(404)
      expect(response.body).not.toContain('Mercado')
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })
  it('nega consulta com MFA incompleto', async () => {
    const { app, calls } = fixture()
    try {
      const response = await app.inject({ method: 'GET', url, headers: { authorization: 'Bearer alice:aal1' } })
      expect(response.statusCode).toBe(403)
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })
  it('permite consulta a VIEWER associado ao espaço', async () => {
    const { app, calls } = fixture()
    try {
      const response = await app.inject({ method: 'GET', url, headers: { authorization: 'Bearer viewer:aal2' } })
      expect(response.statusCode).toBe(200)
      expect(response.json().data[0].workspaceId).toBe(spaceId)
      expect(calls).toEqual(['list:' + spaceId])
      expect(response.headers['cache-control']).toContain('no-store')
    } finally { await app.close() }
  })
  it('VIEWER não pode gravar', async () => {
    const { app, calls } = fixture()
    try {
      const response = await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer viewer:aal2' }, payload })
      expect(response.statusCode).toBe(404)
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })
  it('impede que usuário defina workspaceId no corpo', async () => {
    const { app, calls } = fixture()
    try {
      const response = await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer alice:aal2' }, payload: { ...payload, workspaceId: 'outra-conta' } })
      expect(response.statusCode).toBe(400)
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })
  it('bloqueia gravações em Preview, mesmo para OWNER', async () => {
    const { app, calls } = fixture(false)
    try {
      const response = await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer alice:aal2' }, payload })
      expect(response.statusCode).toBe(403)
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })
  it('OWNER com AAL2 cria lançamento dentro do próprio espaço', async () => {
    const { app, calls } = fixture()
    try {
      const response = await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer alice:aal2' }, payload })
      expect(response.statusCode).toBe(201)
      expect(response.json().data).toMatchObject({ workspaceId: spaceId, amountCents: 12999 })
      expect(calls).toEqual(['create:' + spaceId])
    } finally { await app.close() }
  })
  it('rejeita valores negativos e campo inesperado', async () => {
    const { app, calls } = fixture()
    try {
      const response = await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer alice:aal2' }, payload: { ...payload, amountCents: -100 } })
      expect(response.statusCode).toBe(400)
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })
})
