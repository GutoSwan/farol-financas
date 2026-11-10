import { describe, expect, it } from 'vitest'
import { mayInitializeAuth } from '../src/domain/auth/qaPreviewIsolation'

const DEV = 'https://tvirkrjkgdtybtcundon.supabase.co'
const PROD = 'https://xwzbcabyjhmgggbkaxvt.supabase.co'
const KEY = 'sb_publishable_FAKEKEYFORDEVONLYTEST2345678'

describe('Proteção do login na Preview exclusiva de QA', () => {
  it('aceita cliente Dev com chave publicável sintética e flag de QA', () => {
    expect(mayInitializeAuth(DEV, KEY, true)).toBe(true)
  })
  it('nunca inicializa Auth de produção com flag Dev-only', () => {
    expect(mayInitializeAuth(PROD, KEY, true)).toBe(false)
  })
  it('recusa URLs falsas, HTTP, chaves secretas ou placeholders', () => {
    expect(mayInitializeAuth(DEV+'.malicious.test',KEY,true)).toBe(false)
    expect(mayInitializeAuth('http://tvirkrjkgdtybtcundon.supabase.co',KEY,true)).toBe(false)
    expect(mayInitializeAuth(DEV,'service_role',true)).toBe(false)
    expect(mayInitializeAuth(DEV,'sb_secret_TEST',true)).toBe(false)
    expect(mayInitializeAuth(DEV,'sb_publishable_SUBSTITUA',true)).toBe(false)
  })
})
