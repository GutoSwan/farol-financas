import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readOnlineFinance } from '../src/infrastructure/api/onlineFinance'

const { user, session } = vi.hoisted(() => ({
  user: vi.fn(),
  session: vi.fn(),
}))
vi.mock('../src/infrastructure/auth/supabase', () => ({
  supabase: { auth: { getUser: user, getSession: session } },
}))
vi.mock('../src/infrastructure/api/apiEndpoint', () => ({
  apiEndpoint: (path: string) => 'https://example.test' + path,
}))
const space = { id: '33333333-3333-4333-8333-333333333333', name: 'Teste', role: 'OWNER' as const }
const identityId = '11111111-1111-4111-8111-111111111111'
const otherSpace = '22222222-2222-4222-8222-222222222222'

describe('Cliente financeiro online: isolamento e proteção de leitura', () => {
  beforeEach(() => {
    user.mockResolvedValue({ data: { user: { id: identityId } }, error: null })
    session.mockResolvedValue({ data: { session: { access_token: 'test-token', user: { id: identityId } } }, error: null })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })
  it('não consulta API quando identidade mudou', async () => {
    user.mockResolvedValue({ data: { user: { id: otherSpace } }, error: null })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(readOnlineFinance(space, 'transactions', identityId)).rejects.toThrow('sessão mudou')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('faz GET com cookie apenas da mesma origem e Bearer Supabase, sem cache nem escrita', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ data: [{ id: 't1', workspaceId: space.id, description: 'Teste', amountCents: 100 }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await readOnlineFinance(space, 'transactions', identityId)
    expect(result).toEqual([{ id: 't1', workspaceId: space.id, label: 'Teste', amountCents: 100 }])
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/v1/workspaces/' + space.id + '/transactions?limit=50')
    expect(options).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'same-origin', redirect: 'error' })
    expect(options.headers.Authorization).toBe('Bearer test-token')
    expect(JSON.stringify(options)).not.toContain('Content-Type')
  })
  it('rejeita resposta contendo registro de outro espaço', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ data: [{ id: 't1', workspaceId: otherSpace, description: 'Privado', amountCents: 500 }] }),
    }))
    await expect(readOnlineFinance(space, 'transactions', identityId)).rejects.toThrow('fora do espaço autorizado')
  })
  it('não considera erro de permissão como lista vazia', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    await expect(readOnlineFinance(space, 'budgets', identityId)).rejects.toThrow('duas etapas')
  })
  it('rejeita workspace sem UUID antes de enviar token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(readOnlineFinance({ ...space, id: 'local-space' }, 'budgets', identityId)).rejects.toThrow('Identificador')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
