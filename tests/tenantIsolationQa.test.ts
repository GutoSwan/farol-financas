import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), getSession: vi.fn(), assurance: vi.fn(),
  identity: vi.fn(), workspaces: vi.fn(),
}))
vi.mock('../src/infrastructure/auth/supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
      getSession: mocks.getSession,
      mfa: { getAuthenticatorAssuranceLevel: mocks.assurance },
    },
  },
}))
vi.mock('../src/infrastructure/api/onlineWorkspaces', () => ({
  getOnlineIdentity: mocks.identity,
  listOnlineWorkspaces: mocks.workspaces,
}))
vi.mock('../src/infrastructure/api/apiEndpoint', () => ({
  apiEndpoint: (path: string) => 'https://farol-qa.test' + path,
}))

import { runTenantIsolationQa } from '../src/infrastructure/api/tenantIsolationQa'

const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'
const spaceA = '33333333-3333-4333-8333-333333333333'
const spaceB = '44444444-4444-4444-8444-444444444444'
const a = { id: spaceA, name: 'QA - Conta atual', role: 'OWNER' as const }
const b = { id: spaceB, name: 'QA - Conta B', role: 'OWNER' as const }

function login(identity: string, own: typeof a | typeof b) {
  mocks.getUser.mockResolvedValue({ data: { user: { id: identity } }, error: null })
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: identity }, access_token: 'qa-jwt-token' } }, error: null })
  mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
  mocks.identity.mockResolvedValue({ id: identity })
  mocks.workspaces.mockResolvedValue([own])
}

describe('Teste real de isolamento por sessão AAL2 e UUID estrangeiro', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    login(userA, a)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('Conta A: quatro HTTP 404 vindos da Conta B são aprovação', async () => {
    const requests = vi.fn().mockResolvedValue({ status: 404 })
    vi.stubGlobal('fetch', requests)
    const result = await runTenantIsolationQa(userA, spaceA, spaceB)
    expect(result.status).toBe('passed')
    expect(result.own).toBe('A')
    expect(result.checks).toHaveLength(4)
    expect(result.checks.every(x => x.status === 'passed' && x.httpStatus === 404)).toBe(true)
    expect(requests).toHaveBeenCalledTimes(4)
    for (const call of requests.mock.calls) {
      const [url, options] = call
      expect(url).toContain('/workspaces/' + spaceB + '/')
      expect(url).not.toContain(spaceA)
      expect(options).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'same-origin', redirect: 'error' })
      expect(options.headers.Authorization).toBe('Bearer qa-jwt-token')
    }
  })

  it('Conta B: testa A de modo simétrico e exige quatro bloqueios', async () => {
    login(userB, b)
    const requests = vi.fn().mockResolvedValue({ status: 404 })
    vi.stubGlobal('fetch', requests)
    const result = await runTenantIsolationQa(userB, spaceA, spaceB)
    expect(result.status).toBe('passed')
    expect(result.own).toBe('B')
    expect(requests).toHaveBeenCalledTimes(4)
    expect(requests.mock.calls.every(([url]) => url.includes('/workspaces/' + spaceA + '/'))).toBe(true)
  })

  it('HTTP 200 no espaço alheio é FALHA; não interpreta o corpo da resposta', async () => {
    const json = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ status: 200, json })
      .mockResolvedValue({ status: 404 }))
    const result = await runTenantIsolationQa(userA, spaceA, spaceB)
    expect(result.status).toBe('failed')
    expect(result.checks[0]).toMatchObject({ status: 'failed', httpStatus: 200 })
    expect(json).not.toHaveBeenCalled()
  })

  it('401, 403, 500 e erro de rede são inconclusivos, não aprovados', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ status: 401 })
      .mockResolvedValueOnce({ status: 403 })
      .mockResolvedValueOnce({ status: 500 })
      .mockRejectedValueOnce(new Error('network')))
    const result = await runTenantIsolationQa(userA, spaceA, spaceB)
    expect(result.status).toBe('inconclusive')
    expect(result.checks.every(x => x.status === 'inconclusive')).toBe(true)
  })

  it('uma conta que lista ambos os espaços falha ANTES de qualquer consulta', async () => {
    mocks.workspaces.mockResolvedValue([a, b])
    const requests = vi.fn()
    vi.stubGlobal('fetch', requests)
    await expect(runTenantIsolationQa(userA, spaceA, spaceB)).rejects.toThrow(/isolamento falhou/i)
    expect(requests).not.toHaveBeenCalled()
  })

  it('sem AAL2 não envia nem uma consulta financeira', async () => {
    mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    const requests = vi.fn()
    vi.stubGlobal('fetch', requests)
    await expect(runTenantIsolationQa(userA, spaceA, spaceB)).rejects.toThrow(/2FA/)
    expect(requests).not.toHaveBeenCalled()
  })

  it('bloqueia se sessão mudou ou identidade da API diverge', async () => {
    const requests = vi.fn()
    vi.stubGlobal('fetch', requests)
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: userB } }, error: null })
    await expect(runTenantIsolationQa(userA, spaceA, spaceB)).rejects.toThrow(/identidade mudou/)
    mocks.identity.mockResolvedValueOnce({ id: userB })
    await expect(runTenantIsolationQa(userA, spaceA, spaceB)).rejects.toThrow(/divergente/)
    expect(requests).not.toHaveBeenCalled()
  })
})
