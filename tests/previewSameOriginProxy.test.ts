import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import proxy from '../api/v1/[...path].js?raw'
import apiEndpoint from '../src/infrastructure/api/apiEndpoint.ts?raw'
import frontendVercel from '../vercel.json?raw'

describe('Proxy protegido do Farol Preview', () => {
  it('o arquivo da função passa na verificação real de sintaxe JavaScript', () => {
    expect(() => execFileSync(process.execPath, ['--check', new URL('../api/v1/[...path].js', import.meta.url).pathname])).not.toThrow()
  })
  it('aceita GET e libera apenas mutações de lançamentos de teste com flag privada', () => {
    expect(proxy).toContain("process.env.VERCEL_ENV !== 'preview'")
    expect(proxy).toContain("req.method !== 'GET'")
    expect(proxy).toContain('FAROL_QA_TRANSACTION_WRITES_ENABLED')
    expect(proxy).toContain('QA_TRANSACTION_COLLECTION.test(route)')
    expect(proxy).toContain('QA_TRANSACTION_ITEM.test(route)')
    expect(proxy).toContain("headers['If-Match'] = version")
    expect(proxy).toContain("res.statusCode = 405")
    expect(proxy).toContain("const SIMPLE_PATHS = new Set(")
    expect(proxy).toContain("SPACE_PATH.test(route)")
    expect(proxy).toContain("READINESS_PATH.test(route)")
    expect(proxy).toContain("backendOrigin()")
    expect(proxy).toContain("['...path', 'workspaceId', 'kind']")
    expect(proxy).toContain("FAROL_QA_BACKEND_ORIGIN")
  })

  it('autentica chamadas entre as duas Previews usando credenciais privadas do servidor', () => {
    expect(proxy).toContain('process.env.FAROL_QA_BACKEND_BYPASS_SECRET')
    expect(proxy).toContain('process.env.VERCEL_OIDC_TOKEN')
    expect(proxy).toContain("headers['x-vercel-protection-bypass'] = bypass")
    expect(proxy).toContain("headers['x-vercel-trusted-oidc-idp-token'] = oidc")
    expect(proxy).toContain("headers.Authorization = token")
    expect(proxy).not.toContain("req.headers['x-vercel-oidc-token']")
    expect(proxy).not.toContain("req.headers['x-vercel-protection-bypass']")
    expect(proxy).not.toContain('VITE_FAROL_QA_BACKEND_BYPASS_SECRET')
    expect(proxy).toContain("redirect: 'manual'")
    expect(proxy).toContain("cache: 'no-store'")
  })

  it('a API do navegador continua validando o JWT e recebe somente JSON', () => {
    expect(apiEndpoint).toContain('VITE_API_BASE_URL')
    expect(proxy).toContain("route !== '/api/v1/health'")
    expect(proxy).toContain("route !== '/api/v1/ready'")
    expect(proxy).toContain("'Autenticação necessária.'")
    expect(proxy).toContain("includes('application/json')")
    expect(JSON.parse(frontendVercel).rewrites.some((r: {source:string}) => r.source.includes('/api/'))).toBe(false)
  })
})
