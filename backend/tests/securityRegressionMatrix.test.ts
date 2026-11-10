import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'
import type { TransactionRepository } from '../src/domain/repositories/TransactionRepository.js'
import type { FinancialCatalogRepository } from '../src/domain/repositories/FinancialCatalogRepository.js'
import type { FinancialCatalogMutations } from '../src/domain/repositories/FinancialCatalogMutations.js'
import type { InvoiceRepository } from '../src/domain/repositories/InvoiceRepository.js'

const owner = '11111111-1111-4111-8111-111111111111'
const editor = '22222222-2222-4222-8222-222222222222'
const viewer = '33333333-3333-4333-8333-333333333333'
const outsider = '44444444-4444-4444-8444-444444444444'
const space = '55555555-5555-4555-8555-555555555555'
const record = '66666666-6666-4666-8666-666666666666'
const path = '/api/v1/workspaces/' + space
const token = (name: string) => ({ authorization: 'Bearer ' + name })
const transactionInput = {
  description: 'Mercado', category: 'Alimentação', amountCents: 1200,
  occurredOn: '2026-11-09', kind: 'EXPENSE' as const,
}
const catalogKinds = ['recurring-bills', 'fixed-expenses', 'budgets'] as const
const validCatalogBodies = {
  'recurring-bills': { name: 'Internet', dueDay: 10, active: true },
  'fixed-expenses': { name: 'Academia', amountCents: 9900, dueDay: 5,
    startMonth: '2026-10', endBeforeMonth: null },
  budgets: { title: 'Casa', category: 'Reforma', targetCents: 100000,
    status: 'PLANNING', notes: '' },
}
const pathCatalog = (kind: string) => path + '/' + kind

/**
 * API real sobre Fastify.inject, com repositórios inteiramente falsos.
 * Nunca usa rede, banco de dados, tokens reais ou credenciais Supabase.
 * Captura chamadas para provar que não se lê nem grava nada se faltar MFA ou vínculo.
 */
function fixture({ writes = true, invoiceReads = true, invoiceUploads = true }:
  { writes?: boolean; invoiceReads?: boolean; invoiceUploads?: boolean } = {}) {
  const seen = {
    list: vi.fn(async (userId: string) =>
      userId === outsider ? [] : [{ id: space, name: 'Família', role:
        userId === owner ? 'OWNER' as const : userId === editor ? 'EDITOR' as const : 'VIEWER' as const }]),
    membership: vi.fn(async (userId: string, workspaceId: string,
      allowedRoles: readonly string[] = []) => {
      const role = userId === owner ? 'OWNER' : userId === editor ? 'EDITOR' :
        userId === viewer ? 'VIEWER' : null
      return workspaceId === space && role !== null &&
        (!allowedRoles.length || allowedRoles.includes(role))
    }),
    transactionsRead: vi.fn(async (_workspaceId: string, _limit: number) =>
      [{ id: record, workspaceId: space, description: 'Mercado', category: 'Alimentação',
        amountCents: 1200, kind: 'EXPENSE' as const, occurredOn: '2026-11-09', version: 1 }]),
    transactionsCreate: vi.fn(async (entry: Parameters<TransactionRepository['createForWorkspace']>[0]) =>
      ({ id: record, ...entry, version: 1 })),
    transactionsUpdate: vi.fn(async (_workspaceId: string, _id: string,
      _changes: Parameters<TransactionRepository['updateWithinWorkspace']>[2], _version: number) =>
      ({ id: record, workspaceId: space, ...transactionInput, version: 2 })),
    transactionsDelete: vi.fn(async (_workspaceId: string, _id: string, _version: number) => true),
    billsRead: vi.fn(async (_id: string, _limit: number) => []),
    fixedRead: vi.fn(async (_id: string, _limit: number) => []),
    budgetsRead: vi.fn(async (_id: string, _limit: number) => []),
    catalogCreate: vi.fn(async (_entry: Parameters<FinancialCatalogMutations['create']>[0]) =>
      ({ id: record, workspaceId: space, version: 1 })),
    catalogUpdate: vi.fn(async (_entry: Parameters<FinancialCatalogMutations['update']>[0]) =>
      ({ id: record, workspaceId: space, version: 2 })),
    catalogDelete: vi.fn(async (_kind: string, _ws: string, _id: string, _version: number) => true),
    invoicesRead: vi.fn(async (_workspaceId: string, _uploadedBy: string) => []),
    invoicesCreate: vi.fn(async (_entry: Parameters<InvoiceRepository['create']>[0]) =>
      ({ id: record, billingMonth: '2026-11', state: 'QUARANTINED' as const,
        scanStatus: 'PENDING' as const, createdAt: '2026-11-09T00:00:00Z' })),
  }
  const workspaceRepository: WorkspaceRepository = {
    listForUser: seen.list,
    async createOwnedBy() { throw new Error('Criação não esperada neste teste.') },
    hasMembership: seen.membership,
  }
  const transactionRepository: TransactionRepository = {
    listForWorkspace: seen.transactionsRead,
    createForWorkspace: seen.transactionsCreate,
    updateWithinWorkspace: seen.transactionsUpdate,
    deleteWithinWorkspace: seen.transactionsDelete,
  }
  const financialCatalog: FinancialCatalogRepository = {
    listRecurringBills: seen.billsRead,
    listFixedExpenses: seen.fixedRead,
    listBudgets: seen.budgetsRead,
  }
  const financialCatalogMutations: FinancialCatalogMutations = {
    create: seen.catalogCreate,
    update: seen.catalogUpdate,
    delete: seen.catalogDelete,
  }
  const invoiceRepository: InvoiceRepository = {
    listPersonal: seen.invoicesRead,
    create: seen.invoicesCreate,
  }
  const app = buildApp({
    auth: {
      async verifyAccessToken(raw) {
        const users = {
          'owner-aal2': { userId: owner, assuranceLevel: 'aal2' as const },
          'owner-aal1': { userId: owner, assuranceLevel: 'aal1' as const },
          'editor-aal2': { userId: editor, assuranceLevel: 'aal2' as const },
          'viewer-aal2': { userId: viewer, assuranceLevel: 'aal2' as const },
          'outsider-aal2': { userId: outsider, assuranceLevel: 'aal2' as const },
        }
        const identity = users[raw as keyof typeof users]
        if (!identity) throw new Error('Token inválido.')
        return identity
      },
    },
    workspaceService: new WorkspaceService(workspaceRepository),
    transactionRepository, financialCatalog, financialCatalogMutations,
    invoiceRepository,
    allowWorkspaceWrites: writes,
    allowInvoiceReads: invoiceReads,
    allowInvoiceUploads: invoiceUploads,
    checkDatabase: async () => true,
  })
  return { app, seen }
}

const openApps: Array<ReturnType<typeof fixture>['app']> = []
function createApp(config?: Parameters<typeof fixture>[0]) {
  const result = fixture(config)
  openApps.push(result.app)
  return result
}
afterEach(async () => {
  await Promise.all(openApps.splice(0).map(app => app.close()))
})

describe('Regressão de segurança: autenticação e acesso entre usuários', () => {
  it('não expõe identidade, espaços ou lançamentos sem token válido', async () => {
    const { app, seen } = createApp()
    for (const url of ['/api/v1/me', '/api/v1/workspaces', path, path + '/transactions']) {
      for (const headers of [{}, token('inválido')]) {
        const response = await app.inject({ method: 'GET', url, headers })
        expect(response.statusCode).toBe(401)
        expect(response.body).not.toContain('Família')
        expect(response.headers['cache-control']).toContain('no-store')
      }
    }
    expect(seen.membership).not.toHaveBeenCalled()
    expect(seen.transactionsRead).not.toHaveBeenCalled()
    expect(seen.list).not.toHaveBeenCalled()
  })

  it('exige AAL2 para todos os dados financeiros, mas não para identificar a sessão', async () => {
    const { app, seen } = createApp()
    const headers = token('owner-aal1')
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers })
    expect(me.statusCode).toBe(200)
    expect(me.json().data.id).toBe(owner)
    for (const url of ['/api/v1/workspaces', path, path + '/transactions',
      ...catalogKinds.map(pathCatalog), path + '/invoices']) {
      expect((await app.inject({ method: 'GET', url, headers })).statusCode).toBe(403)
    }
    expect(seen.list).not.toHaveBeenCalled()
    expect(seen.membership).not.toHaveBeenCalled()
    expect(seen.transactionsRead).not.toHaveBeenCalled()
    expect(seen.invoicesRead).not.toHaveBeenCalled()
  })

  it('outro usuário autenticado não consegue ver nem enumerar os recursos financeiros', async () => {
    const { app, seen } = createApp()
    const headers = token('outsider-aal2')
    expect((await app.inject({ method: 'GET', url: '/api/v1/workspaces', headers })).json().data).toEqual([])
    for (const url of [path, path + '/transactions', ...catalogKinds.map(pathCatalog), path + '/invoices']) {
      const response = await app.inject({ method: 'GET', url, headers })
      expect(response.statusCode).toBe(404)
      expect(response.body).not.toContain('Mercado')
    }
    expect(seen.transactionsRead).not.toHaveBeenCalled()
    expect(seen.billsRead).not.toHaveBeenCalled()
    expect(seen.fixedRead).not.toHaveBeenCalled()
    expect(seen.budgetsRead).not.toHaveBeenCalled()
    expect(seen.invoicesRead).not.toHaveBeenCalled()
  })

  it('VIEWER lê somente dados do próprio espaço, sem poderes de escrita', async () => {
    const { app, seen } = createApp()
    const headers = token('viewer-aal2')
    expect((await app.inject({ method: 'GET', url: path + '/transactions', headers })).statusCode).toBe(200)
    for (const kind of catalogKinds) {
      expect((await app.inject({ method: 'GET', url: pathCatalog(kind), headers })).statusCode).toBe(200)
    }
    expect((await app.inject({ method: 'POST', url: path + '/transactions',
      headers, payload: transactionInput })).statusCode).toBe(404)
    expect((await app.inject({ method: 'POST', url: pathCatalog('recurring-bills'),
      headers, payload: validCatalogBodies['recurring-bills'] })).statusCode).toBe(404)
    expect(seen.transactionsCreate).not.toHaveBeenCalled()
    expect(seen.catalogCreate).not.toHaveBeenCalled()
  })

  it('o servidor ignora identidade e workspaceId manipulados no corpo e valida dados financeiros', async () => {
    const { app, seen } = createApp()
    const headers = token('owner-aal2')
    expect((await app.inject({ method: 'POST', url: path + '/transactions', headers,
      payload: { ...transactionInput, userId: outsider } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: path + '/transactions', headers,
      payload: { ...transactionInput, workspaceId: space } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: path + '/transactions', headers,
      payload: { ...transactionInput, occurredOn: '2026-02-30' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: path + '/transactions', headers,
      payload: transactionInput })).statusCode).toBe(201)
    expect(seen.transactionsCreate).toHaveBeenCalledTimes(1)
    expect(seen.transactionsCreate.mock.calls[0][0].workspaceId).toBe(space)
  })

  it('não altera dados financeiros em preview mesmo com OWNER, AAL2 e entradas válidas', async () => {
    const { app, seen } = createApp({ writes: false })
    const headers = token('owner-aal2')
    const requests = [
      { method: 'POST' as const, url: path + '/transactions', payload: transactionInput },
      { method: 'PATCH' as const, url: path + '/transactions/' + record,
        payload: { amountCents: 3000 } },
      { method: 'DELETE' as const, url: path + '/transactions/' + record },
      ...catalogKinds.map(kind => ({
        method: 'POST' as const, url: pathCatalog(kind), payload: validCatalogBodies[kind],
      })),
      { method: 'POST' as const, url: '/api/v1/workspaces', payload: { name: 'Teste' } },
    ]
    for (const request of requests) {
      const response = await app.inject({ ...request, headers })
      expect(response.statusCode).toBe(403)
    }
    expect(seen.transactionsCreate).not.toHaveBeenCalled()
    expect(seen.transactionsUpdate).not.toHaveBeenCalled()
    expect(seen.transactionsDelete).not.toHaveBeenCalled()
    expect(seen.catalogCreate).not.toHaveBeenCalled()
  })

  it('não executa mutações de nenhum tipo sem AAL2, mesmo que a escrita esteja habilitada', async () => {
    const { app, seen } = createApp()
    const headers = token('owner-aal1')
    for (const request of [
      { method: 'POST' as const, url: path + '/transactions', payload: transactionInput },
      { method: 'PATCH' as const, url: path + '/transactions/' + record, payload: { amountCents: 9000 } },
      { method: 'DELETE' as const, url: path + '/transactions/' + record },
      ...catalogKinds.map(kind => ({ method: 'POST' as const,
        url: pathCatalog(kind), payload: validCatalogBodies[kind] })),
    ]) {
      expect((await app.inject({ ...request, headers })).statusCode).toBe(403)
    }
    expect(seen.transactionsCreate).not.toHaveBeenCalled()
    expect(seen.transactionsUpdate).not.toHaveBeenCalled()
    expect(seen.transactionsDelete).not.toHaveBeenCalled()
    expect(seen.catalogCreate).not.toHaveBeenCalled()
  })

  it('PATCH/DELETE exigem If-Match e nunca chamam repositório sem precondição', async () => {
    const { app, seen } = createApp()
    const headers = token('owner-aal2')
    for (const url of [path + '/transactions/' + record,
      ...catalogKinds.map(kind => pathCatalog(kind) + '/' + record)]) {
      const patch = await app.inject({ method: 'PATCH', url, headers, payload: { name: 'Novo' } })
      // Transações validam payload antes do cabeçalho; o importante é jamais gravar.
      expect([400, 428]).toContain(patch.statusCode)
      const deletion = await app.inject({ method: 'DELETE', url, headers })
      expect(deletion.statusCode).toBe(428)
    }
    expect(seen.transactionsUpdate).not.toHaveBeenCalled()
    expect(seen.transactionsDelete).not.toHaveBeenCalled()
    expect(seen.catalogUpdate).not.toHaveBeenCalled()
    expect(seen.catalogDelete).not.toHaveBeenCalled()
  })

  it('recusa edição ou remoção por um estranho, mesmo conhecendo o ID e o If-Match', async () => {
    const { app, seen } = createApp()
    const headers = { ...token('outsider-aal2'), 'if-match': '"1"' }
    for (const url of [path + '/transactions/' + record,
      ...catalogKinds.map(kind => pathCatalog(kind) + '/' + record)]) {
      expect((await app.inject({ method: 'DELETE', url, headers })).statusCode).toBe(404)
    }
    expect(seen.transactionsDelete).not.toHaveBeenCalled()
    expect(seen.catalogDelete).not.toHaveBeenCalled()
  })

  it('faturas ficam separadas pelo usuário que enviou, inclusive no espaço familiar', async () => {
    const { app, seen } = createApp()
    expect((await app.inject({ method: 'GET', url: path + '/invoices',
      headers: token('owner-aal2') })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: path + '/invoices',
      headers: token('editor-aal2') })).statusCode).toBe(200)
    expect(seen.invoicesRead.mock.calls).toEqual([[space, owner], [space, editor]])
  })

  it('upload de faturas exige as duas flags, mesmo para OWNER autenticado', async () => {
    const { app, seen } = createApp({ writes: true, invoiceUploads: false })
    const pdfBase64 = Buffer.from('%PDF-1.4\nobj\n').toString('base64')
    const response = await app.inject({
      method: 'POST', url: path + '/invoices', headers: token('owner-aal2'),
      payload: { billingMonth: '2026-11', issuer: 'Banco',
        totalCents: 5000, dueDate: '2026-11-10', pdfBase64 },
    })
    expect(response.statusCode).toBe(403)
    expect(seen.invoicesCreate).not.toHaveBeenCalled()
  })

  it('cabeçalhos da API protegem respostas financeiras contra cache e enquadramento', async () => {
    const { app } = createApp()
    const response = await app.inject({ method: 'GET', url: path + '/transactions',
      headers: token('owner-aal2') })
    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toContain('no-store')
    expect(response.headers['x-frame-options']).toBe('DENY')
    expect(response.headers['content-security-policy']).toContain("default-src 'none'")
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })
})
