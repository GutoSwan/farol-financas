import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'
import type { TransactionRepository } from '../src/domain/repositories/TransactionRepository.js'
import type { FinancialCatalogRepository } from '../src/domain/repositories/FinancialCatalogRepository.js'

/**
 * Duas identidades independentes simuladas, sem usar chaves ou tokens reais.
 * O teste de isolamento HTTP com dois JWTs REAIS do Supabase Dev é separado.
 */
const a = '11111111-1111-4111-8111-111111111111'
const b = '22222222-2222-4222-8222-222222222222'
const wa = '33333333-3333-4333-8333-333333333333'
const wb = '44444444-4444-4444-8444-444444444444'
const spaces = [
  { userId: a, id: wa, name: 'QA - Espaço A', role: 'OWNER' as const, amount: 111 },
  { userId: b, id: wb, name: 'QA - Espaço B', role: 'OWNER' as const, amount: 222 },
]
const kinds = ['transactions', 'recurring-bills', 'fixed-expenses', 'budgets'] as const
type Kind = (typeof kinds)[number]

function setup() {
  const calls: string[] = []
  const workspaceRepository: WorkspaceRepository = {
    async listForUser(userId) {
      return spaces.filter(x => x.userId === userId)
        .map(({ id, name, role }) => ({ id, name, role }))
    },
    async createOwnedBy() { throw new Error('Gravação desativada') },
    async hasMembership(userId, workspaceId, roles = []) {
      const member = spaces.find(x => x.userId === userId && x.id === workspaceId)
      return !!member && (roles.length === 0 || roles.includes(member.role))
    },
  }
  const transactions: TransactionRepository = {
    async listForWorkspace(workspaceId) {
      calls.push('transactions:' + workspaceId)
      const s = spaces.find(x => x.id === workspaceId)
      return s ? [{ id: s.userId, workspaceId, description: s.name,
        category: 'QA', amountCents: s.amount, kind: 'EXPENSE' as const, occurredOn: '2026-11-09' }] : []
    },
    async createForWorkspace() { throw new Error('Gravação inesperada') },
    async updateWithinWorkspace() { throw new Error('Gravação inesperada') },
    async deleteWithinWorkspace() { throw new Error('Gravação inesperada') },
  }
  const catalog: FinancialCatalogRepository = {
    async listRecurringBills(workspaceId) {
      calls.push('recurring-bills:' + workspaceId)
      return [{ id: wa, workspaceId, name: 'QA', dueDay: 10, active: true }]
    },
    async listFixedExpenses(workspaceId) {
      calls.push('fixed-expenses:' + workspaceId)
      const s = spaces.find(x => x.id === workspaceId)
      return [{ id: wa, workspaceId, name: 'QA', amountCents: s?.amount ?? 0,
        dueDay: 5, startMonth: '2026-11', endBeforeMonth: null }]
    },
    async listBudgets(workspaceId) {
      calls.push('budgets:' + workspaceId)
      const s = spaces.find(x => x.id === workspaceId)
      return [{ id: wa, workspaceId, title: 'QA', category: 'Teste',
        targetCents: s?.amount ?? 0, status: 'PLANNING' }]
    },
  }
  const app = buildApp({
    auth: {
      async verifyAccessToken(token) {
        const identities = {
          'a:aal2': { userId: a, assuranceLevel: 'aal2' as const },
          'b:aal2': { userId: b, assuranceLevel: 'aal2' as const },
          'a:aal1': { userId: a, assuranceLevel: 'aal1' as const },
          'b:aal1': { userId: b, assuranceLevel: 'aal1' as const },
        }
        const principal = identities[token as keyof typeof identities]
        if (!principal) throw new Error('JWT inválido')
        return principal
      },
    },
    workspaceService: new WorkspaceService(workspaceRepository),
    transactionRepository: transactions,
    financialCatalog: catalog,
    allowWorkspaceWrites: false,
    allowInvoiceReads: false,
    allowInvoiceUploads: false,
    checkDatabase: async () => true,
  })
  return { app, calls }
}

const auth = (token: string) => ({ authorization: 'Bearer ' + token })
const endpoint = (spaceId: string, kind: Kind) =>
  `/api/v1/workspaces/${spaceId}/${kind}?limit=50`

describe('Isolamento bilateral A/B por workspace e MFA', () => {
  for (const kind of kinds) {
    it(`${kind}: A consegue ler somente A; B consegue ler somente B`, async () => {
      const { app, calls } = setup()
      try {
        for (const identity of [
          { token: 'a:aal2', own: wa, foreign: wb },
          { token: 'b:aal2', own: wb, foreign: wa },
        ]) {
          const own = await app.inject({ method: 'GET', url: endpoint(identity.own, kind),
            headers: auth(identity.token) })
          expect(own.statusCode).toBe(200)
          expect(own.json().data).toHaveLength(1)
          expect(own.json().data[0].workspaceId).toBe(identity.own)
          const beforeForeign = calls.length
          const foreign = await app.inject({ method: 'GET', url: endpoint(identity.foreign, kind),
            headers: auth(identity.token) })
          expect(foreign.statusCode).toBe(404)
          expect(foreign.body).not.toContain('QA - Espaço')
          expect(foreign.body).not.toContain('amountCents')
          expect(calls).toHaveLength(beforeForeign) // sem consultar o repositório
        }
        expect(calls).toEqual([`${kind}:${wa}`, `${kind}:${wb}`])
      } finally { await app.close() }
    })

    it(`${kind}: AAL1, anônimo e token inválido nunca consultam valores`, async () => {
      const { app, calls } = setup()
      try {
        const cases = [
          { token: 'a:aal1', expected: 403 },
          { token: 'b:aal1', expected: 403 },
          { token: 'token-falso', expected: 401 },
        ]
        for (const item of cases) {
          const res = await app.inject({ method: 'GET', url: endpoint(wa, kind),
            headers: auth(item.token) })
          expect(res.statusCode).toBe(item.expected)
        }
        const anon = await app.inject({ method: 'GET', url: endpoint(wb, kind) })
        expect(anon.statusCode).toBe(401)
        expect(calls).toHaveLength(0)
      } finally { await app.close() }
    })
  }

  it('GET /workspaces não revela a lista da outra identidade', async () => {
    const { app } = setup()
    try {
      for (const identity of [
        { token: 'a:aal2', own: wa, foreign: wb },
        { token: 'b:aal2', own: wb, foreign: wa },
      ]) {
        const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces',
          headers: auth(identity.token) })
        expect(res.statusCode).toBe(200)
        expect(res.json().data.map((s: { id: string }) => s.id)).toEqual([identity.own])
        expect(res.body).not.toContain(identity.foreign)
      }
    } finally { await app.close() }
  })

  it('ID inexistente e espaço alheio retornam o mesmo status 404', async () => {
    const { app } = setup()
    try {
      const foreign = await app.inject({ method: 'GET', url: endpoint(wb, 'transactions'), headers: auth('a:aal2') })
      const absent = await app.inject({ method: 'GET', url: endpoint('55555555-5555-4555-8555-555555555555', 'transactions'), headers: auth('a:aal2') })
      expect(foreign.statusCode).toBe(404)
      expect(absent.statusCode).toBe(404)
      expect(foreign.body).toBe(absent.body)
    } finally { await app.close() }
  })

  it('Preview proíbe alterações HTTP mesmo ao dono AAL2', async () => {
    const { app, calls } = setup()
    try {
      const payload = { description: 'QA', category: 'Teste', amountCents: 500,
        kind: 'EXPENSE', occurredOn: '2026-11-09' }
      const res = await app.inject({ method: 'POST', url: endpoint(wa, 'transactions'),
        headers: auth('a:aal2'), payload })
      expect(res.statusCode).toBe(403)
      expect(calls).toHaveLength(0)
    } finally { await app.close() }
  })
})
