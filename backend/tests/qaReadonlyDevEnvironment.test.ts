import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isVerifiedDevPreviewEnvironment } from '../src/infrastructure/security/environmentIsolation.js'
const ref='tvirkrjkgdtybtcundon'
const base={
  VERCEL_ENV:'preview',
  FAROL_DEV_SUPABASE_REF:ref,
  SUPABASE_URL:'https://'+ref+'.supabase.co',
  DATABASE_URL:'postgresql://farol_preview_adminqa_ro.'+ref+
    ':test-only-not-a-secret-123456@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require',
  FAROL_PREVIEW_ADMIN_QA_READONLY:'true',
  FAROL_PREVIEW_ADMIN_QA_AUTH_ONLY:'false',
  FAROL_FINANCIAL_WRITES_ENABLED:'false',
  FAROL_INVOICE_UPLOADS_ENABLED:'false',
}
describe('Conta técnica QA isolada e sem escrita',()=>{
  it('aceita somente Supabase Dev e role limitado',()=>{
    expect(isVerifiedDevPreviewEnvironment(base)).toBe(true)
    expect(isVerifiedDevPreviewEnvironment({...base,SUPABASE_URL:'https://xwzbcabyjhmgggbkaxvt.supabase.co'})).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({...base,DATABASE_URL:base.DATABASE_URL.replace('farol_preview_adminqa_ro.','postgres.')})).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({...base,FAROL_DEV_SUPABASE_REF:'xwzbcabyjhmgggbkaxvt'})).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({...base,DATABASE_URL:base.DATABASE_URL.replace(':6543/',':5432/')})).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({...base,DATABASE_URL:base.DATABASE_URL.replace('test-only-not-a-secret-123456','short')})).toBe(false)
  })
  it('bloqueia configurações de escrita',()=>{
    expect(isVerifiedDevPreviewEnvironment({...base,FAROL_FINANCIAL_WRITES_ENABLED:'true'})).toBe(false)
    expect(isVerifiedDevPreviewEnvironment({...base,FAROL_INVOICE_UPLOADS_ENABLED:'true'})).toBe(false)
  })
  it('não consulta auth.users e auth.sessions diretamente com papel técnico',()=>{
    const app=readFileSync(new URL('../src/app.ts',import.meta.url),'utf8')
    expect(app).toContain('farol_qa_private.is_active_session(')
    expect(app).toContain("process.env.FAROL_PREVIEW_ADMIN_QA_READONLY === 'true'")
    expect(app).toContain("path.startsWith('/api/v1/admin/')")
    expect(app).toContain("Preview financeira somente leitura.")
    expect(app).toContain('allowLegacyConnectionWrites: false')
  })
})
