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
  occurredOn: '2026-11-07', version: 1,
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
    async updateWithinWorkspace(workspaceId, transactionId, changes) {
      calls.push('update:' + workspaceId + ':' + transactionId)
      if (workspaceId !== spaceId || transactionId !== record.id) return null
      return { ...record, ...changes }
    },
    async deleteWithinWorkspace(workspaceId, transactionId) {
      calls.push('delete:' + workspaceId + ':' + transactionId)
      return workspaceId === spaceId && transactionId === record.id
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

const transactionUrl = url + '/' + record.id

describe('Transações: edição e exclusão protegidas', () => {
  it('nega PATCH e DELETE sem token', async () => {
    const { app, calls } = fixture()
    try {
      for (const method of ['PATCH', 'DELETE'] as const) {
        const res = await app.inject({ method, url: transactionUrl, ...(method === 'PATCH' ? { payload: { description: 'Novo' } } : {}) })
        expect(res.statusCode).toBe(401)
      }
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })

  it('nega usuário de outro espaço, sem consultar transações', async () => {
    const { app, calls } = fixture()
    try {
      for (const method of ['PATCH', 'DELETE'] as const) {
        const res = await app.inject({ method, url: transactionUrl, headers: { authorization: 'Bearer bob:aal2' }, ...(method === 'PATCH' ? { payload: { description: 'Novo' } } : {}) })
        expect(res.statusCode).toBe(404)
      }
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })

  it('VIEWER não pode editar nem excluir', async () => {
    const { app, calls } = fixture()
    try {
      for (const method of ['PATCH', 'DELETE'] as const) {
        const res = await app.inject({ method, url: transactionUrl, headers: { authorization: 'Bearer viewer:aal2' }, ...(method === 'PATCH' ? { payload: { description: 'Novo' } } : {}) })
        expect(res.statusCode).toBe(404)
      }
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })

  it('sem AAL2 não edita ou exclui, mesmo sendo OWNER', async () => {
    const { app, calls } = fixture()
    try {
      for (const method of ['PATCH', 'DELETE'] as const) {
        const res = await app.inject({ method, url: transactionUrl, headers: { authorization: 'Bearer alice:aal1' }, ...(method === 'PATCH' ? { payload: { description: 'Novo' } } : {}) })
        expect(res.statusCode).toBe(403)
      }
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })

  it('bloqueia toda mutação no Preview', async () => {
    const { app, calls } = fixture(false)
    try {
      const headers = { authorization: 'Bearer alice:aal2' }
      expect((await app.inject({ method: 'PATCH', url: transactionUrl, headers, payload: { description: 'Novo' } })).statusCode).toBe(403)
      expect((await app.inject({ method: 'DELETE', url: transactionUrl, headers })).statusCode).toBe(403)
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })

  it('bloqueia PATCH vazio, campos de ID e valores inválidos', async () => {
    const { app, calls } = fixture()
    try {
      const headers = { authorization: 'Bearer alice:aal2' }
      for (const invalid of [{}, { workspaceId: spaceId }, { amountCents: -1 }, { occurredOn: '2026-02-30' }]) {
        const res = await app.inject({ method: 'PATCH', url: transactionUrl, headers, payload: invalid })
        expect(res.statusCode).toBe(400)
      }
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })

  it('OWNER com MFA pode editar e excluir somente registro do próprio espaço', async () => {
    const { app, calls } = fixture()
    try {
      const headers = { authorization: 'Bearer alice:aal2', 'if-match': '"1"' }
      const updated = await app.inject({ method: 'PATCH', url: transactionUrl, headers, payload: { description: 'Compra editada' } })
      expect(updated.statusCode).toBe(200)
      expect(updated.json().data.description).toBe('Compra editada')
      const deleted = await app.inject({ method: 'DELETE', url: transactionUrl, headers })
      expect(deleted.statusCode).toBe(204)
      expect(calls).toEqual(['update:' + spaceId + ':' + record.id, 'delete:' + spaceId + ':' + record.id])
    } finally { await app.close() }
  })

  it('não revela IDs inexistentes em PATCH ou DELETE', async () => {
    const { app } = fixture()
    try {
      const headers = { authorization: 'Bearer alice:aal2', 'if-match': '"1"' }
      const nonexistent = '66666666-6666-4666-8666-666666666666'
      const updated = await app.inject({ method: 'PATCH', url: url + '/' + nonexistent, headers, payload: { description: 'Novo' } })
      const deleted = await app.inject({ method: 'DELETE', url: url + '/' + nonexistent, headers })
      expect(updated.statusCode).toBe(404)
      expect(deleted.statusCode).toBe(404)
      expect(updated.body).not.toContain('Mercado')
    } finally { await app.close() }
  })
})
