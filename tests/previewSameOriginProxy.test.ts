import { describe, expect, it } from 'vitest'
import proxy from '../api/v1/[...path].js?raw'
import apiEndpoint from '../src/infrastructure/api/apiEndpoint.ts?raw'
import frontendVercel from '../vercel.json?raw'

describe('Proxy protegido do Farol Preview', () => {
  it('aceita somente operações GET no ambiente Preview', () => {
    expect(proxy).toContain("process.env.VERCEL_ENV !== 'preview'")
    expect(proxy).toContain("req.method !== 'GET'")
    expect(proxy).toContain("res.statusCode = 405")
    expect(proxy).toContain("const SIMPLE_PATHS = new Set(")
    expect(proxy).toContain("SPACE_PATH.test(target.pathname)")
  })

  it('encaminha token de identidade OIDC da Vercel sem segredo de bypass', () => {
    expect(proxy).toContain("req.headers['x-vercel-oidc-token']")
    expect(proxy).toContain("'x-vercel-trusted-oidc-idp-token': oidc")
    expect(proxy).toContain("headers.Authorization = token")
    expect(proxy).not.toContain('VERCEL_AUTOMATION_BYPASS_SECRET')
    expect(proxy).not.toContain('x-vercel-protection-bypass')
    expect(proxy).toContain("redirect: 'manual'")
    expect(proxy).toContain("cache: 'no-store'")
  })

  it('a API do navegador continua validando o JWT e recebe somente JSON', () => {
    expect(apiEndpoint).toContain('VITE_API_BASE_URL')
    expect(proxy).toContain("target.pathname !== '/api/v1/health'")
    expect(proxy).toContain("target.pathname !== '/api/v1/ready'")
    expect(proxy).toContain("'Autenticação necessária.'")
    expect(proxy).toContain("contentType.includes('application/json')")
    expect(JSON.parse(frontendVercel).rewrites.some((r: {source:string}) => r.source.includes('/api/'))).toBe(false)
  })
})
