import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOnlineWorkspace, getOnlineIdentity, listOnlineWorkspaces } from '../src/infrastructure/api/onlineWorkspaces'

vi.mock('../src/infrastructure/auth/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'token-de-teste' } }, error: null }),
    },
  },
}))

describe('Cliente de autenticação Fastify', () => {
  beforeEach(() => { vi.unstubAllGlobals() })

  it('envia JWT ao backend e só aceita identidade no formato esperado', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ data: { id: 'usuario-jwt' } }),
    })
    vi.stubGlobal('fetch', request)
    expect(await getOnlineIdentity()).toEqual({ id: 'usuario-jwt' })
    expect(request).toHaveBeenCalledWith('/api/v1/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-de-teste' }),
      }))
  })

  it('não permite especificar o userId do proprietário ao criar um espaço online', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ data: { id: 'novo-id', name: 'Casa', role: 'OWNER' } }),
    })
    vi.stubGlobal('fetch', request)
    const result = await createOnlineWorkspace('   Casa  ')
    expect(result.name).toBe('Casa')
    const options = request.mock.calls[0][1] as RequestInit
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body as string)).toEqual({ name: 'Casa' })
    expect(options.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer token-de-teste' }))
  })

  it('não permite resposta inválida ou negar token sem mostrar dados antigos', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ data: [{ id: 'x', name: 'Y', role: 'ADMIN' }] }),
    })
    vi.stubGlobal('fetch', request)
    await expect(listOnlineWorkspaces()).rejects.toThrow('inesperada')
    request.mockResolvedValue({ ok: false, status: 401 })
    await expect(getOnlineIdentity()).rejects.toThrow('recusou o token')
  })

  it('valida nome antes de enviar qualquer dado financeiro ou criar espaço', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    await expect(createOnlineWorkspace('a')).rejects.toThrow()
    expect(request).not.toHaveBeenCalled()
  })
})
