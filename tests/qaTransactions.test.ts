import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getUser, getSession } = vi.hoisted(() => ({
  getUser: vi.fn(), getSession: vi.fn(),
}))
vi.mock('../src/infrastructure/auth/supabase', () => ({
  supabase: { auth: { getUser, getSession } },
}))
vi.mock('../src/infrastructure/api/apiEndpoint', () => ({
  apiEndpoint: (path: string) => 'https://example.test' + path,
}))
const id = '11111111-1111-4111-8111-111111111111'
const space = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'QA - Casa compartilhada (Dev)', role: 'EDITOR' as const,
}
const recordId = '55555555-5555-4555-8555-555555555555'
const input = {
  description: 'Venda de teste', category: 'Feira', amountCents: 456,
  kind: 'INCOME' as const, occurredOn: '2026-11-16',
}
const response = { data: { ...input, id: recordId, workspaceId: space.id, version: 1 } }
async function actions() {
  vi.resetModules()
  return import('../src/infrastructure/api/qaTransactions')
}
describe('Gravação na nuvem QA: somente espaços fictícios', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_FAROL_QA_DEV_ONLY', 'true')
    vi.stubEnv('VITE_FAROL_QA_TRANSACTION_WRITES_ENABLED', 'true')
    getUser.mockResolvedValue({ data: { user: { id } }, error: null })
    getSession.mockResolvedValue({ data: { session: { user: { id }, access_token: 'test-token' } }, error: null })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.resetAllMocks()
  })

  it('bloqueia toda escrita quando flag QA está desligada', async () => {
    vi.stubEnv('VITE_FAROL_QA_TRANSACTION_WRITES_ENABLED', 'false')
    const { createQaTransaction } = await actions()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(createQaTransaction(space, id, input)).rejects.toThrow('desativada')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('bloqueia espaço real e perfil VIEWER antes da rede', async () => {
    const { createQaTransaction } = await actions()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(createQaTransaction({ ...space, name: 'Valora3D' }, id, input)).rejects.toThrow('Somente espaços')
    await expect(createQaTransaction({ ...space, role: 'VIEWER' }, id, input)).rejects.toThrow('Somente espaços')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('nega requisição se a sessão mudou entre duas contas', async () => {
    const { createQaTransaction } = await actions()
    getUser.mockResolvedValue({ data: { user: { id: recordId } }, error: null })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(createQaTransaction(space, id, input)).rejects.toThrow('sessão mudou')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cria lançamento apenas com Bearer e JSON na mesma origem', async () => {
    const { createQaTransaction } = await actions()
    const fetchMock = vi.fn().mockResolvedValue({ status: 201, ok: true, json: async () => response })
    vi.stubGlobal('fetch', fetchMock)
    await expect(createQaTransaction(space, id, input)).resolves.toMatchObject(response.data)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.test/api/v1/workspaces/' + space.id + '/transactions')
    expect(opts).toMatchObject({ method: 'POST', cache: 'no-store', credentials: 'same-origin', redirect: 'error' })
    expect(opts.headers.Authorization).toBe('Bearer test-token')
    expect(JSON.parse(opts.body)).toEqual(input)
    expect(opts.headers['If-Match']).toBeUndefined()
  })

  it('edita com versão obrigatória e avisa quando outra conta já editou', async () => {
    const { updateQaTransaction } = await actions()
    const record = { id: recordId, version: 1 }
    const fetchMock = vi.fn().mockResolvedValue({ status: 409, ok: false })
    vi.stubGlobal('fetch', fetchMock)
    await expect(updateQaTransaction(space, id, record, input)).rejects.toThrow('Outra conta alterou')
    expect(fetchMock.mock.calls[0][1].headers['If-Match']).toBe('"1"')
    expect(fetchMock.mock.calls[0][0]).toContain('/transactions/' + recordId)
  })

  it('exclui com versão e valida resposta 204', async () => {
    const { deleteQaTransaction } = await actions()
    const fetchMock = vi.fn().mockResolvedValue({ status: 204, ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await expect(deleteQaTransaction(space, id, { id: recordId, version: 2 })).resolves.toBe(null)
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
    expect(fetchMock.mock.calls[0][1].headers['If-Match']).toBe('"2"')
  })
})
