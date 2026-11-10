import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const goodEnv = {
  VERCEL_ENV: 'preview',
  FAROL_PREVIEW_ADMIN_QA_AUTH_ONLY: 'true',
  FAROL_PREVIEW_ADMIN_QA_READONLY: 'true',
  SUPABASE_URL: 'https://tvirkrjkgdtybtcundon.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_SYNTHETIC_TEST_KEY_123456789012',
  FAROL_DEV_SUPABASE_REF: 'tvirkrjkgdtybtcundon',
  FAROL_FINANCIAL_WRITES_ENABLED: 'false',
  FAROL_INVOICE_UPLOADS_ENABLED: 'false',
  FAROL_INVOICE_READS_ENABLED: 'false',
  CORS_ORIGIN: 'https://farol-financas-qa.vercel.app',
  // In this QA mode, even a mistakenly inherited Prod DATABASE_URL must never be used.
  DATABASE_URL: 'postgresql://postgres.xwzbcabyjhmgggbkaxvt:FAKE@aws-0.pooler.supabase.com:6543/postgres',
}

function setup(overrides: Record<string,string | undefined>={}) {
  for(const [key,value] of Object.entries({...goodEnv,...overrides})) vi.stubEnv(key,value)
  vi.resetModules()
}

describe('API Auth-only QA nunca inicializa ou libera os endpoints financeiros',()=>{
  it('permite apenas health e o pedido de admin com autenticação; nenhum outro recurso',async()=>{
    setup()
    const {default:app}=await import('../src/app.js')
    try {
      const cases = [
        {method:'GET' as const,url:'/api/v1/health',code:200},
        {method:'GET' as const,url:'/api/v1/admin/access',code:401},
        {method:'GET' as const,url:'/api/v1/me',code:403},
        {method:'GET' as const,url:'/api/v1/workspaces',code:403},
        {method:'GET' as const,url:'/api/v1/workspaces/id/transactions',code:403},
        {method:'POST' as const,url:'/api/v1/admin/access',code:403},
        {method:'POST' as const,url:'/api/v1/workspaces',code:403},
        {method:'DELETE' as const,url:'/api/v1/workspaces/any',code:403},
      ]
      for(const x of cases){
        const res=await app.inject({method:x.method,url:x.url})
        expect(res.statusCode, x.method+' '+x.url).toBe(x.code)
        expect(res.body).not.toContain('postgres.xwzbcabyjhmgggbkaxvt')
      }
    }finally{await app.close()}
  })

  it('toda a API fecha se o projeto Auth mudar para Production',async()=>{
    setup({SUPABASE_URL:'https://xwzbcabyjhmgggbkaxvt.supabase.co'})
    const {default:app}=await import('../src/app.js')
    try {
      const response=await app.inject({method:'GET',url:'/api/v1/admin/access'})
      expect(response.statusCode).toBe(503)
      expect(response.body).not.toContain('xwzbcabyjhmgggbkaxvt')
    }finally{await app.close()}
  })
})
