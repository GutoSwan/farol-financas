import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../admin-web/api/v1/[...path].js'

const jwt = 'a'.repeat(100)
const oidc = 'b'.repeat(100)
const request = (overrides = {}) => ({
  method: 'GET',
  url: '/api/v1/admin/access',
  headers: { authorization: 'Bearer ' + jwt, 'x-vercel-oidc-token': oidc },
  ...overrides,
})
const response = () => ({
  statusCode: 200,
  headers: {},
  body: '',
  setHeader(name, value) { this.headers[name.toLowerCase()] = value },
  end(value = '') { this.body = String(value); return this },
})
const send = async (req) => {
  const res = response()
  await handler(req, res)
  return res
}
const upstream = (status, content, type = 'application/json') =>
  new Response(content, { status, headers: { 'content-type': type } })

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'preview')
  vi.stubGlobal('fetch', vi.fn(async () => upstream(403, '{"error":"Sem acesso."}')))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Farol Admin: ponte OIDC isolada sem conta real', () => {
  it('bloqueia totalmente o endpoint fora de Preview', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    expect((await send(request())).statusCode).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('não aceita métodos de escrita', async () => {
    const res = await send(request({method:'POST'}))
    expect(res.statusCode).toBe(405)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('não permite consultar recursos financeiros nem a API comum', async () => {
    for (const url of ['/api/v1/workspaces', '/api/v1/admin/access?x=1', '/api/v1/admin/users']) {
      expect((await send(request({url}))).statusCode).toBe(404)
    }
    expect(fetch).not.toHaveBeenCalled()
  })
  it('recusa JWT faltante ou inválido antes de consultar backend', async () => {
    for (const authorization of [undefined,'Bearer invalid']) {
      const res = await send(request({headers:{authorization,'x-vercel-oidc-token':oidc}}))
      expect(res.statusCode).toBe(401)
    }
    expect(fetch).not.toHaveBeenCalled()
  })
  it('recusa chamada sem OIDC da infraestrutura', async () => {
    const res=await send(request({headers:{authorization:'Bearer '+jwt}}))
    expect(res.statusCode).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('mantém o bloqueio 403 do backend para conta comum', async () => {
    const res=await send(request())
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error).toBe('Sem acesso.')
    const [target,opts] = fetch.mock.calls[0]
    expect(target).toContain('/api/v1/admin/access')
    expect(opts.headers.Authorization).toBe('Bearer '+jwt)
    expect(opts.headers['x-vercel-trusted-oidc-idp-token']).toBe(oidc)
    expect(opts.redirect).toBe('manual')
  })
  it('não confia em HTML de login da Vercel ou redirecionamentos', async () => {
    fetch.mockResolvedValue(upstream(200,'<html>Login</html>','text/html'))
    expect((await send(request())).statusCode).toBe(502)
    fetch.mockResolvedValue(upstream(302,'', 'text/plain'))
    expect((await send(request())).statusCode).toBe(502)
  })
  it('retorna 200 somente quando o backend confirma autorização', async () => {
    fetch.mockResolvedValue(upstream(200,'{"data":{"superAdmin":true}}'))
    const res=await send(request())
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).data.superAdmin).toBe(true)
    expect(res.headers['cache-control']).toContain('no-store')
  })
  it('falha fechado quando a API Dev está indisponível', async () => {
    fetch.mockRejectedValue(new Error('network down'))
    const res=await send(request())
    expect(res.statusCode).toBe(502)
    expect(res.body).not.toContain('network down')
  })
})
