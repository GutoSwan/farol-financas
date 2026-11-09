import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'
import type { TransactionRepository } from '../src/domain/repositories/TransactionRepository.js'
import type { FinancialCatalogMutations } from '../src/domain/repositories/FinancialCatalogMutations.js'
import type { InvoiceRepository } from '../src/domain/repositories/InvoiceRepository.js'

const workspace = '33333333-3333-4333-8333-333333333333'
const record = '44444444-4444-4444-8444-444444444444'
const token = 'owner:aal2'
const headers = { authorization: 'Bearer ' + token }
const payloads = {
  transactions: { description: 'QA', category: 'QA', amountCents: 555, kind: 'EXPENSE', occurredOn: '2026-11-09' },
  'recurring-bills': { name: 'QA', dueDay: 10 },
  'fixed-expenses': { name: 'QA', amountCents: 555, dueDay: 10, startMonth: '2026-11' },
  budgets: { title: 'QA', category: 'QA', targetCents: 555 },
}
const base = '/api/v1/workspaces/' + workspace
const writeCases = [
  { method: 'POST', path: '/api/v1/workspaces', body: { name: 'Novo espaço' } },
  { method: 'POST', path: base + '/transactions', body: payloads.transactions },
  { method: 'PATCH', path: base + '/transactions/' + record, body: { description: 'QA alterado' } },
  { method: 'DELETE', path: base + '/transactions/' + record },
  ...(['recurring-bills', 'fixed-expenses', 'budgets'] as const).flatMap(kind => [
    { method: 'POST', path: base + '/' + kind, body: payloads[kind] },
    { method: 'PATCH', path: base + '/' + kind + '/' + record, body: { name: 'QA alterado', ...(kind === 'budgets' ? { title: 'QA alterado' } : {}) } },
    { method: 'DELETE', path: base + '/' + kind + '/' + record },
  ]),
  { method: 'POST', path: base + '/invoices', body: {} },
] as const

function setup(allowWorkspaceWrites?: boolean) {
  const calls: string[] = []
  const workspaceRepo: WorkspaceRepository = {
    async listForUser() { return [] },
    async createOwnedBy() { calls.push('workspace.create'); throw Error('unexpected write') },
    async hasMembership() { calls.push('workspace.membership'); return true },
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
  const invoices: InvoiceRepository = {
    async create() { calls.push('invoice.create'); throw Error('unexpected write') },
    async listPersonal() { return [] },
  }
  const app = buildApp({
    auth: { async verifyAccessToken(t) {
      if (t !== token) throw new Error('not authorized')
      return { userId: '11111111-1111-4111-8111-111111111111', assuranceLevel: 'aal2' as const }
    } },
    workspaceService: new WorkspaceService(workspaceRepo),
    transactionRepository: transactions,
    financialCatalogMutations: catalog,
    invoiceRepository: invoices,
    // O campo é intencionalmente omitido quando undefined:
    ...(allowWorkspaceWrites === undefined ? {} : { allowWorkspaceWrites }),
    allowInvoiceUploads: true, // nenhuma flag secundária deve permitir gravar
    checkDatabase: async () => true,
  })
  return { app, calls }
}

describe('Todas as operações financeiras falham fechadas por padrão', () => {
  for (const config of [
    { label: 'sem flag de gravação', flag: undefined },
    { label: 'flag de gravação false', flag: false },
  ] as const) {
    it(config.label + ': bloqueia todas as 14 rotas mesmo com OWNER e AAL2', async () => {
      const { app, calls } = setup(config.flag)
      try {
        for (const action of writeCases) {
          const res = await app.inject({
            method: action.method,
            url: action.path,
            headers,
            ...('body' in action ? { payload: action.body } : {}),
          })
          expect(res.statusCode, action.method + ' ' + action.path).toBe(403)
          expect(res.body).not.toContain('unexpected write')
        }
        expect(calls).toEqual([])
      } finally { await app.close() }
    })
  }
})
