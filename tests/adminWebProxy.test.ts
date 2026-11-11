import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error função serverless Vercel implementada em JavaScript
import handler from '../admin-web/api/v1/admin/access.js'

const jwt = 'a'.repeat(100)
const oidc = 'b'.repeat(100)
type RequestMock = { method: string; url: string; headers: Record<string, string | undefined> }
const request = (overrides: Partial<RequestMock> = {}): RequestMock => ({
  method: 'GET',
  url: '/api/v1/admin/access',
  headers: { authorization: 'Bearer ' + jwt, 'x-vercel-oidc-token': oidc },
  ...overrides,
})
class ResponseMock {
  statusCode = 200
  headers: Record<string, string> = {}
  body = ''
  setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value }
  end(value = '') { this.body = String(value); return this }
}
const send = async (req: RequestMock): Promise<ResponseMock> => {
  const res = new ResponseMock()
  await handler(req, res)
  return res
}
const upstream = (status: number, content: string, type = 'application/json') =>
  new Response(content, { status, headers: { 'content-type': type } })
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'preview')
  fetchMock = vi.fn(async () => upstream(403, '{"error":"Sem acesso."}'))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('Farol Admin: servidor privado só aceita consulta de autorização', () => {
  it('bloqueia endpoint fora do ambiente Preview', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    expect((await send(request())).statusCode).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('recusa métodos de escrita', async () => {
    expect((await send(request({method:'POST'}))).statusCode).toBe(405)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('recusa URLs de recursos de outros usuários ou de finanças', async () => {
    for (const url of ['/api/v1/workspaces', '/api/v1/admin/access?x=1', '/api/v1/admin/users']) {
      expect((await send(request({url}))).statusCode).toBe(404)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('recusa sessão sem JWT válido', async () => {
    for (const authorization of [undefined, 'Bearer invalid']) {
      expect((await send(request({headers:{authorization,'x-vercel-oidc-token':oidc}}))).statusCode).toBe(401)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('não chama API de outro projeto sem OIDC da infraestrutura Vercel', async () => {
    expect((await send(request({headers:{authorization:'Bearer '+jwt}}))).statusCode).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('propaga o bloqueio do servidor para usuário comum', async () => {
    const res = await send(request())
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error).toBe('Sem acesso.')
    const [target, opts] = fetchMock.mock.calls[0] as [string, { headers: Record<string,string>; redirect: string }]
    expect(target).toBe('https://farol-api-git-feat-v029-admin-standalone-preview-farol13.vercel.app/api/v1/admin/access')
    expect(opts.headers.Authorization).toBe('Bearer '+jwt)
    expect(opts.headers['x-vercel-trusted-oidc-idp-token']).toBe(oidc)
    expect(opts.redirect).toBe('manual')
  })
  it('nega HTML de login ou redirecionamento ao invés de JSON', async () => {
    fetchMock.mockResolvedValue(upstream(200,'<html>Login</html>','text/html'))
    expect((await send(request())).statusCode).toBe(502)
    fetchMock.mockResolvedValue(upstream(302,'','text/plain'))
    expect((await send(request())).statusCode).toBe(502)
  })
  it('retorna autorização somente com confirmação explícita pela API', async () => {
    fetchMock.mockResolvedValue(upstream(200,'{"data":{"superAdmin":true}}'))
    const res=await send(request())
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).data.superAdmin).toBe(true)
    expect(res.headers['cache-control']).toContain('no-store')
  })
  it('nega acesso sem revelar erro interno quando backend está indisponível', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const res=await send(request())
    expect(res.statusCode).toBe(502)
    expect(res.body).not.toContain('network down')
  })
})
