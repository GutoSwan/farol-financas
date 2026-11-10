import { describe, expect, it } from 'vitest'
import { isVerifiedDevPreviewEnvironment } from '../src/infrastructure/security/environmentIsolation.js'

const REF = 'tvirkrjkgdtybtcundon'
const base = {
  VERCEL_ENV: 'preview',
  FAROL_DEV_SUPABASE_REF: REF,
  SUPABASE_URL: 'https://' + REF + '.supabase.co',
  DATABASE_URL: 'postgresql://postgres.' + REF + ':not-a-real-password@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
}
describe('Isolamento Dev do backend Vercel Preview', () => {
  it('rejeita configuração ausente ou incongruente', () => {
    expect(isVerifiedDevPreviewEnvironment({ VERCEL_ENV: 'preview' })).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({ ...base, FAROL_DEV_SUPABASE_REF: undefined })).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({ ...base, DATABASE_URL: undefined })).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({ ...base, SUPABASE_URL: undefined })).toBe(false)
  })
  it('permite pooler pertencente ao mesmo projeto Dev', () => {
    expect(isVerifiedDevPreviewEnvironment(base)).toBe(true)
  })
  it('permite host direto de banco pertencente a Dev', () => {
    expect(isVerifiedDevPreviewEnvironment({ ...base, DATABASE_URL: 'postgresql://postgres:password@db.'+REF+'.supabase.co:5432/postgres' })).toBe(true)
  })
  it('rejeita conexão com pooler de outro projeto mesmo com URL Supabase Dev', () => {
    expect(isVerifiedDevPreviewEnvironment({ ...base, DATABASE_URL:base.DATABASE_URL.replace(REF,'aaaaaaaaaaaaaaaaaaaa') })).toBe(false)
  })
  it('rejeita URL de Auth de outro projeto e URLs HTTP', () => {
    expect(isVerifiedDevPreviewEnvironment({ ...base, SUPABASE_URL:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co' })).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({ ...base, SUPABASE_URL:'http://'+REF+'.supabase.co' })).toBe(false)
  })
  it('não aceita hosts falsificados com prefixo/sufixo de projeto', () => {
    expect(isVerifiedDevPreviewEnvironment({ ...base, DATABASE_URL:'postgresql://postgres.'+REF+':password@aws-0.pooler.supabase.com.attacker.test/postgres' })).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({ ...base, DATABASE_URL:'postgresql://postgres.'+REF+':password@evil.supabase.co/postgres' })).toBe(false)
  })
  it('não bloqueia aplicação fora de Preview', () => {
    expect(isVerifiedDevPreviewEnvironment({ VERCEL_ENV: 'production' })).toBe(true)
  })
  it('aceita apenas a role de QA com acesso read-only ao Supabase Dev, com segredo presente', () => {
    const env = {
      ...base,
      FAROL_PREVIEW_ADMIN_QA_READONLY: 'true',
      DATABASE_URL: 'postgresql://farol_preview_adminqa_ro.' + REF + ':synthetic-password-for-qa-12345@aws-0-sa-east-1.pooler.supabase.com:6543/postgres',
    }
    expect(isVerifiedDevPreviewEnvironment(env)).toBe(true)
    expect(isVerifiedDevPreviewEnvironment({ ...env, FAROL_FINANCIAL_WRITES_ENABLED: 'true' })).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({ ...env, FAROL_INVOICE_UPLOADS_ENABLED: 'true' })).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({ ...env, DATABASE_URL: base.DATABASE_URL })).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({
      ...env, DATABASE_URL: env.DATABASE_URL.replace('farol_preview_adminqa_ro.', 'postgres.')
    })).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({
      ...env, DATABASE_URL: env.DATABASE_URL.replace(':6543/', ':5432/')
    })).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({
      ...env, DATABASE_URL: env.DATABASE_URL.replace(REF,'xwzbcabyjhmgggbkaxvt')
    })).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({
      ...env, DATABASE_URL: env.DATABASE_URL.replace('synthetic-password-for-qa-12345','short')
    })).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({
      ...env, SUPABASE_URL: 'https://xwzbcabyjhmgggbkaxvt.supabase.co'
    })).toBe(false)
  })

})
