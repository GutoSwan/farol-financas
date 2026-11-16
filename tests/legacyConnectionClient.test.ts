import { beforeEach, describe, expect, it, vi } from 'vitest'
import { connectReviewedFinancialWorkspace } from '../src/infrastructure/api/legacyConnection'
import type { LocalReviewSpace } from '../src/domain/services/migrationReview'
import type { OnlineWorkspace } from '../src/infrastructure/api/onlineWorkspaces'
import { DEFAULT_WORKSPACE } from '../src/domain/entities/FinancialWorkspace'

const userId = '11111111-1111-4111-8111-111111111111'
const destId = '22222222-2222-4222-8222-222222222222'
vi.mock('../src/infrastructure/auth/supabase', () => ({
  supabase: { auth: {
    getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
    getSession: vi.fn(async () => ({ data: {
      session: { user: { id: userId }, access_token: 'fake-unit-test-token' },
    }, error: null })),
  } },
}))
vi.mock('../src/infrastructure/api/apiEndpoint', () => ({
  apiEndpoint: (path: string) => path,
}))

const source: LocalReviewSpace = {
  workspace: DEFAULT_WORKSPACE, transactions: [], bills: [], monthlyEntries: [],
  fixedExpenses: [], budgets: { projects: [], items: [], quotes: [] },
}
const destination: OnlineWorkspace = { id: destId, name: DEFAULT_WORKSPACE.name, role: 'OWNER' }

beforeEach(() => { vi.unstubAllGlobals() })

describe('Envio do espaço revisado', () => {
  it('envia apenas a origem escolhida com Bearer e nunca dados de outro espaço', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: { status: 'completed', workspaceMapping: 'created', created: 0, reused: 0, total: 0 },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await connectReviewedFinancialWorkspace(source, destination, userId)
    expect(result.status).toBe('completed')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain(destId + '/legacy-connect')
    expect(options.method).toBe('POST')
    expect(options.headers).toMatchObject({ Authorization: 'Bearer fake-unit-test-token' })
    expect(JSON.parse(options.body as string)).toEqual(source)
    expect(options.body).not.toContain('presentes')
  })

  it('exige confirmação antes de enviar meses pagos sem data e não inventa paidAt', async () => {
    const withPaid: LocalReviewSpace = {...source,fixedExpenses:[{
      id:'f1',name:'Internet',amountCents:9800,dueDay:10,startMonth:'2026-10',
      endBeforeMonth:null,paidMonths:['2026-10'],createdAt:'2026-10-01T00:00:00.000Z',
    }]}
    const fetchMock=vi.fn(async () => new Response(JSON.stringify({
      data:{status:'completed',workspaceMapping:'created',created:2,reused:0,total:2},
    }),{status:200}))
    vi.stubGlobal('fetch',fetchMock)
    await expect(connectReviewedFinancialWorkspace(withPaid,destination,userId))
      .rejects.toThrow('Confirme os meses pagos')
    expect(fetchMock).not.toHaveBeenCalled()
    await connectReviewedFinancialWorkspace(withPaid,destination,userId,true)
    const [,requestOptions]=fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const payload=JSON.parse(requestOptions.body as string)
    expect(payload.confirmUnknownFixedPaymentDates).toBe(true)
    expect(payload.fixedExpenses[0].paidMonths).toEqual(['2026-10'])
    expect(payload.fixedExpenses[0]).not.toHaveProperty('paidAt')
  })

  it('não envia sem proprietário, com espaço trocado ou identidade incorreta', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(connectReviewedFinancialWorkspace(source,
      { ...destination, role: 'VIEWER' }, userId)).rejects.toThrow('propriedade')
    await expect(connectReviewedFinancialWorkspace(source,
      { ...destination, name: 'Valora3D' }, userId)).rejects.toThrow('mesmo espaço')
    await expect(connectReviewedFinancialWorkspace(source,
      destination, '33333333-3333-4333-8333-333333333333')).rejects.toThrow('conta mudou')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('não considera conflito ou flag do servidor desligada como sucesso', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 409 })))
    await expect(connectReviewedFinancialWorkspace(source, destination, userId))
      .rejects.toThrow('conflito')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })))
    await expect(connectReviewedFinancialWorkspace(source, destination, userId))
      .rejects.toThrow('bloqueada no servidor')
  })
})
