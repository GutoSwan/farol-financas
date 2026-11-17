import { describe, expect, it } from 'vitest'
import { canAccessAdminOnlyFeature } from './privilegedAccess'

describe('Acesso a funcionalidades exclusivas da administração', () => {
  it('libera apenas papéis administrativos definidos no app_metadata', () => {
    expect(canAccessAdminOnlyFeature({ app_metadata: { farol_role: 'admin' } })).toBe(true)
    expect(canAccessAdminOnlyFeature({ app_metadata: { farol_role: 'super_admin' } })).toBe(true)
    expect(canAccessAdminOnlyFeature({ app_metadata: { farol_role: 'viewer' } })).toBe(false)
    expect(canAccessAdminOnlyFeature({ app_metadata: {} })).toBe(false)
    expect(canAccessAdminOnlyFeature(null)).toBe(false)
  })

  it('nunca permite uma propriedade role fornecida fora de app_metadata', () => {
    expect(canAccessAdminOnlyFeature({
      app_metadata: {},
      user_metadata: { farol_role: 'super_admin' },
    } as unknown as Parameters<typeof canAccessAdminOnlyFeature>[0])).toBe(false)
  })
})
