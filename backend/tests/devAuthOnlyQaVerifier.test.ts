import { describe, expect, it } from 'vitest'
import { DevAuthOnlyQaVerifier, isVerifiedAuthOnlyDevPreview, validQaClaims } from '../src/infrastructure/auth/DevAuthOnlyQaVerifier.js'

const DEV = 'https://tvirkrjkgdtybtcundon.supabase.co'
const UUID = '11111111-1111-4111-8111-111111111111'
const SESSION = '22222222-2222-4222-8222-222222222222'
const KEY = 'sb_publishable_FAKE_KEY_SAFELY_SYNTHETIC_FOR_QA_123'
const base = {
  VERCEL_ENV: 'preview',
  FAROL_PREVIEW_ADMIN_QA_AUTH_ONLY: 'true',
  FAROL_PREVIEW_ADMIN_QA_READONLY: 'true',
  SUPABASE_URL: DEV,
  FAROL_DEV_SUPABASE_REF: 'tvirkrjkgdtybtcundon',
  SUPABASE_PUBLISHABLE_KEY: KEY,
  CORS_ORIGIN: 'https://farol-financas-qa.vercel.app',
  FAROL_FINANCIAL_WRITES_ENABLED: 'false',
  FAROL_INVOICE_UPLOADS_ENABLED: 'false',
  FAROL_INVOICE_READS_ENABLED: 'false',
}
const goodUser = {
  id: UUID,
  email_confirmed_at: '2026-11-10T12:00:00Z',
  app_metadata: { farol_role: 'super_admin' },
  is_anonymous: false,
}
function mockAuth(
  user: object = goodUser,
  factors: object = { totp:[{factor_type:'totp',status:'verified'}] },
  status = 200,
): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    if (!url.startsWith(DEV+'/auth/v1/user')) throw Error('Wrong Auth host')
    if (init?.method !== 'GET' || init?.redirect !== 'error') throw Error('Wrong Auth request')
    const headers = init.headers as Record<string,string>
    if (headers?.apikey !== KEY || headers.Authorization !== 'Bearer '+('a'.repeat(50))) {
      throw Error('Missing caller-bound Auth headers')
    }
    const payload = url.endsWith('/factors') ? factors : user
    return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}})
  }) as typeof fetch
}
const token='a'.repeat(50)

describe('Preview administrativa sem credenciais do banco', () => {
  it('aceita apenas o Dev em Vercel Preview com chave publicável e sem escrita', () => {
    expect(isVerifiedAuthOnlyDevPreview(base)).toBe(true)
    for (const change of [
      {VERCEL_ENV:'production'}, {VERCEL_ENV:undefined},
      {FAROL_PREVIEW_ADMIN_QA_AUTH_ONLY:undefined},
      {FAROL_PREVIEW_ADMIN_QA_READONLY:undefined},
      {SUPABASE_URL:'https://xwzbcabyjhmgggbkaxvt.supabase.co'},
      {SUPABASE_URL:'http://tvirkrjkgdtybtcundon.supabase.co'},
      {FAROL_DEV_SUPABASE_REF:'xwzbcabyjhmgggbkaxvt'},
      {SUPABASE_PUBLISHABLE_KEY:'sb_secret_NOT_PUBLIC'},
      {SUPABASE_PUBLISHABLE_KEY:undefined},
      {FAROL_FINANCIAL_WRITES_ENABLED:'true'},
      {FAROL_INVOICE_UPLOADS_ENABLED:'true'},
      {FAROL_INVOICE_READS_ENABLED:'true'},
      {CORS_ORIGIN:'https://evil.test'},
      {CORS_ORIGIN:'http://farol-financas-qa.vercel.app'},
      {CORS_ORIGIN:'https://farol-financas-qa.vercel.app.evil.test'},
    ]) {
      expect(isVerifiedAuthOnlyDevPreview({...base,...change})).toBe(false)
    }
  })

  it('rejeita sessão não autenticada, fator fraco e ID inexistente', () => {
    expect(validQaClaims({sub:UUID,session_id:SESSION,role:'authenticated',aal:'aal2'})).toEqual({userId:UUID,level:'aal2'})
    for(const value of [
      {sub:UUID,session_id:SESSION,role:'anon',aal:'aal2'},
      {sub:UUID,session_id:SESSION,role:'authenticated',aal:'aal2',is_anonymous:true},
      {sub:UUID,session_id:SESSION,role:'authenticated',aal:'unknown'},
      {sub:'INVALID',session_id:SESSION,role:'authenticated',aal:'aal2'},
      {sub:UUID,session_id:'INVALID',role:'authenticated',aal:'aal2'},
    ]) expect(()=>validQaClaims(value)).toThrow()
  })

  it('autoriza a conta atual somente após consultar Auth do Dev e o TOTP verificado',async()=>{
    const v = new DevAuthOnlyQaVerifier(KEY,mockAuth())
    expect(await v.checkSuperAdmin(UUID,token)).toBe(true)
  })

  it('não aceita role ausente, e-mail não confirmado, conta anônima ou dados de outra pessoa',async()=>{
    const users = [
      {...goodUser,app_metadata:{farol_role:'administrador'}},
      {...goodUser,email_confirmed_at:null},
      {...goodUser,is_anonymous:true},
      {...goodUser,id:SESSION},
    ]
    for (const user of users) {
      const v = new DevAuthOnlyQaVerifier(KEY,mockAuth(user))
      expect(await v.checkSuperAdmin(UUID,token)).toBe(false)
    }
  })

  it('rejeita TOTP removido ou não verificado',async()=>{
    for(const factors of [
      {totp:[]},
      {totp:[{factor_type:'totp',status:'unverified'}]},
      {totp:[{factor_type:'phone',status:'verified'}]},
      {totp:[]},
    ]){
      expect(await new DevAuthOnlyQaVerifier(KEY,mockAuth(goodUser,factors)).checkSuperAdmin(UUID,token)).toBe(false)
    }
  })

  it('falha fechado se Supabase responder 403 ou a rede falhar',async()=>{
    const bad = new DevAuthOnlyQaVerifier(KEY,mockAuth(goodUser,{},403))
    expect(await bad.checkSuperAdmin(UUID,token)).toBe(false)
    const offline = new DevAuthOnlyQaVerifier(KEY, (async()=>{ throw Error('offline') }) as typeof fetch)
    expect(await offline.checkSuperAdmin(UUID,token)).toBe(false)
    expect(await offline.checkSuperAdmin(UUID)).toBe(false)
  })
})
