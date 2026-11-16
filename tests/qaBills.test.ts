import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getUser, getSession } = vi.hoisted(() => ({ getUser: vi.fn(), getSession: vi.fn() }))
vi.mock('../src/infrastructure/auth/supabase', () => ({
  supabase: { auth: { getUser, getSession } },
}))
vi.mock('../src/infrastructure/api/apiEndpoint', () => ({
  apiEndpoint: (path: string) => 'https://example.test' + path,
}))

const userId = '11111111-1111-4111-8111-111111111111'
const space = {
  id: '01c6765f-b873-420f-a5f2-68c54aa22500',
  name: 'QA - Casa compartilhada (Dev)', role: 'EDITOR' as const,
}
const billId = '55555555-5555-4555-8555-555555555555'
const target = { id: billId, version: 3 }
const okJson = { data: { id: billId, workspaceId: space.id, version: 4 } }
async function actions() {
  vi.resetModules()
  return import('../src/infrastructure/api/qaBills')
}
function mockReply(status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => 'reached' },
    json: async () => okJson }
}

describe('Contas mensais QA: cliente seguro de escrita', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_FAROL_QA_DEV_ONLY', 'true')
    vi.stubEnv('VITE_FAROL_QA_TRANSACTION_WRITES_ENABLED', 'true')
    getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
    getSession.mockResolvedValue({ data: { session: { user: { id: userId }, access_token: 'test-token' } }, error: null })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.resetAllMocks()
  })
  it('recusa Preview sem flag e espaço fora dos dois UUIDs QA', async () => {
    const mock = vi.fn()
    vi.stubGlobal('fetch', mock)
    let api = await actions()
    await expect(api.createQaBill({ ...space, id: '33333333-3333-4333-8333-333333333333' },
      userId, { name: 'QA', dueDay: 10, active: true })).rejects.toThrow('indisponível')
    await expect(api.createQaBill({ ...space, role: 'VIEWER' }, userId,
      { name: 'QA', dueDay: 10, active: true })).rejects.toThrow('indisponível')
    vi.stubEnv('VITE_FAROL_QA_TRANSACTION_WRITES_ENABLED', 'false')
    api = await actions()
    await expect(api.createQaBill(space, userId, { name: 'QA', dueDay: 10, active: true }))
      .rejects.toThrow('indisponível')
    expect(mock).not.toHaveBeenCalled()
  })
  it('recusa sessão trocada antes de acessar rede', async () => {
    const api = await actions()
    getUser.mockResolvedValue({ data: { user: { id: '22222222-2222-4222-8222-222222222222' } }, error: null })
    const mock = vi.fn()
    vi.stubGlobal('fetch', mock)
    await expect(api.createQaBill(space, userId, { name: 'QA', dueDay: 10, active: true }))
      .rejects.toThrow('sessão mudou')
    expect(mock).not.toHaveBeenCalled()
  })
  it('cria por POST fixo com JWT, sessão restrita e sem If-Match', async () => {
    const mock = vi.fn().mockResolvedValue(mockReply(201))
    vi.stubGlobal('fetch', mock)
    const { createQaBill } = await actions()
    await createQaBill(space, userId, { name: 'QA', dueDay: 10, active: true })
    const [url, options] = mock.mock.calls[0]
    expect(url).toBe('https://example.test/api/v1/qa-bill-write')
    expect(options.method).toBe('POST')
    expect(options.credentials).toBe('same-origin')
    expect(options.headers.Authorization).toBe('Bearer test-token')
    expect(options.headers['If-Match']).toBeUndefined()
    expect(JSON.parse(options.body)).toMatchObject({ workspaceId: space.id, action: 'create', input: { name: 'QA' } })
  })
  it('envia versão na edição, mês e remoção (sem alterar outro espaço)', async () => {
    const mock = vi.fn().mockResolvedValue(mockReply())
    vi.stubGlobal('fetch', mock)
    const api = await actions()
    await api.updateQaBill(space, userId, target, { name: 'Água', dueDay: 12, active: true })
    await api.saveQaMonth(space, userId, target, { yearMonth: '2026-11', amountCents: 1234, status: 'PAID' })
    await api.deleteQaMonth(space, userId, target, '2026-11')
    await api.deleteQaBill(space, userId, target)
    expect(mock).toHaveBeenCalledTimes(4)
    for (const call of mock.mock.calls) expect(call[1].headers['If-Match']).toBe('"3"')
    expect(JSON.parse(mock.mock.calls[1][1].body)).toMatchObject({
      action: 'upsert-month', billId, workspaceId: space.id, input: { status: 'PAID', amountCents: 1234 },
    })
    expect(JSON.parse(mock.mock.calls[2][1].body)).toMatchObject({
      action: 'delete-month', yearMonth: '2026-11', billId,
    })
    expect(JSON.parse(mock.mock.calls[3][1].body)).toMatchObject({ action: 'delete', billId })
  })
  it('exige versão válida e não envia período inválido', async () => {
    const mock = vi.fn()
    vi.stubGlobal('fetch', mock)
    const api = await actions()
    await expect(api.deleteQaBill(space, userId, { id: billId, version: 0 })).rejects.toThrow('versão atual')
    await expect(api.saveQaMonth(space, userId, target, { yearMonth: '2026-13', amountCents: 100, status: 'PAID' }))
      .rejects.toThrow('mês')
    expect(mock).not.toHaveBeenCalled()
  })
  it('informa conflito 409 ao atualizar com versão desatualizada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockReply(409)))
    const { updateQaBill } = await actions()
    await expect(updateQaBill(space, userId, target, { name: 'Luz', dueDay: 10, active: true }))
      .rejects.toThrow('Outra conta alterou')
  })
})
