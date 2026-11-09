import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'
import type { TransactionRepository } from '../src/domain/repositories/TransactionRepository.js'
import type { FinancialCatalogMutations } from '../src/domain/repositories/FinancialCatalogMutations.js'

/**
 * No real credentials, network or DB writes. A and B represent distinct
 * verified AAL2 identities. Their workspace UUIDs are intentionally known
 * to the attacker. The mutation repository MUST NOT be called for foreign IDs.
 */
const a = '11111111-1111-4111-8111-111111111111'
const b = '22222222-2222-4222-8222-222222222222'
const viewer = '55555555-5555-4555-8555-555555555555'
const wa = '33333333-3333-4333-8333-333333333333'
const wb = '44444444-4444-4444-8444-444444444444'
const record = '66666666-6666-4666-8666-666666666666'
const kinds = ['transactions','recurring-bills','fixed-expenses','budgets'] as const
const mutationBodies = {
  transactions: { description: 'QA', category: 'QA', amountCents: 123, kind: 'EXPENSE', occurredOn: '2026-11-09' },
  'recurring-bills': { name: 'QA', dueDay: 12 },
  'fixed-expenses': { name: 'QA', amountCents: 123, dueDay: 12, startMonth: '2026-11' },
  budgets: { title: 'QA', category: 'QA', targetCents: 123 },
}
const patchBodies = {
  transactions: { description: 'QA editado' },
  'recurring-bills': { name: 'QA editado' },
  'fixed-expenses': { name: 'QA editado' },
  budgets: { title: 'QA editado' },
}

function setup() {
  const calls: string[] = []
  const memberships: Record<string, { space: string; role: 'OWNER'|'VIEWER' }> = {
    [a]: { space: wa, role: 'OWNER' },
    [b]: { space: wb, role: 'OWNER' },
    [viewer]: { space: wa, role: 'VIEWER' },
  }
  const workspaces: WorkspaceRepository = {
    async listForUser() { return [] },
    async createOwnedBy() { calls.push('workspace.create'); throw Error('unexpected write') },
    async hasMembership(userId, workspaceId, roles = []) {
      const member = memberships[userId]
      return !!member && member.space === workspaceId &&
        (!roles.length || roles.includes(member.role))
    },
  }
  const transactions: TransactionRepository = {
    async listForWorkspace() { return [] },
    async createForWorkspace() { calls.push('transaction.create'); throw Error('unexpected write') },
    async updateWithinWorkspace() { calls.push('transaction.update'); throw Error('unexpected write') },
    async deleteWithinWorkspace() { calls.push('transaction.delete'); throw Error('unexpected write') },
  }
  const catalog: FinancialCatalogMutations = {
    async create() { calls.push('catalog.create'); throw Error('unexpected write') },
    async update() { calls.push('catalog.update'); throw Error('unexpected write') },
    async delete() { calls.push('catalog.delete'); throw Error('unexpected write') },
  }
  const app = buildApp({
    auth: { async verifyAccessToken(token) {
      const [identity, assurance] = token.split(':')
      const userId = identity === 'a' ? a : identity === 'b' ? b :
        identity === 'viewer' ? viewer : null
      if (!userId) throw Error('Invalid token')
      return { userId, assuranceLevel: assurance === 'aal2' ? 'aal2' as const : 'aal1' as const }
    } },
    workspaceService: new WorkspaceService(workspaces),
    transactionRepository: transactions,
    financialCatalogMutations: catalog,
    allowWorkspaceWrites: true, // unit-test ONLY, never the real Preview
    checkDatabase: async () => true,
  })
  return { app, calls }
}
function url(space: string, kind: typeof kinds[number], method: 'POST'|'PATCH'|'DELETE') {
  return '/api/v1/workspaces/' + space + '/' + kind + (method === 'POST' ? '' : '/' + record)
}
function request(method: 'POST'|'PATCH'|'DELETE', space: string, kind: typeof kinds[number], token: string) {
  return {
    method, url: url(space, kind, method),
    headers: { authorization: 'Bearer ' + token },
    ...(method === 'POST' ? { payload: mutationBodies[kind] } :
      method === 'PATCH' ? { payload: patchBodies[kind] } : {}),
  }
}

describe('Escrita isolada A ↔ B: criação, edição e exclusão em 4 módulos', () => {
  for (const kind of kinds) {
    for (const method of ['POST','PATCH','DELETE'] as const) {
      it(kind + ' ' + method + ': as duas identidades são bloqueadas no espaço alheio', async () => {
        const { app, calls } = setup()
        try {
          const crossAttempts = [
            { user: 'a:aal2', space: wb },
            { user: 'b:aal2', space: wa },
          ]
          for (const attempt of crossAttempts) {
            const response = await app.inject(request(method, attempt.space, kind, attempt.user))
            expect(response.statusCode).toBe(404)
            expect(response.body).not.toContain('QA editado')
            expect(response.body).not.toContain('amountCents')
          }
          expect(calls).toEqual([])
        } finally { await app.close() }
      })
    }
  }

  it('VIEWER com 2FA não altera nem seu próprio espaço em nenhum módulo', async () => {
    const { app, calls } = setup()
    try {
      for (const kind of kinds) {
        for (const method of ['POST','PATCH','DELETE'] as const) {
          const response = await app.inject(request(method, wa, kind, 'viewer:aal2'))
          expect(response.statusCode).toBe(404)
        }
      }
      expect(calls).toEqual([])
    } finally { await app.close() }
  })

  it('sem AAL2 não executa qualquer escrita mesmo como dono', async () => {
    const { app, calls } = setup()
    try {
      for (const kind of kinds) {
        for (const method of ['POST','PATCH','DELETE'] as const) {
          const response = await app.inject(request(method, wa, kind, 'a:aal1'))
          expect(response.statusCode).toBe(403)
        }
      }
      expect(calls).toEqual([])
    } finally { await app.close() }
  })

  it('token falsificado não autoriza escrita', async () => {
    const { app, calls } = setup()
    try {
      const response = await app.inject(request('POST', wa, 'transactions', 'forged:aal2'))
      expect(response.statusCode).toBe(401)
      expect(calls).toEqual([])
    } finally { await app.close() }
  })
})
