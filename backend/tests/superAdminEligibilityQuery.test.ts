import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const entrypoint = readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8')

describe('Contrato de verificação atual da conta Super Admin no banco', () => {
  const start = entrypoint.indexOf('async checkSuperAdmin(userId)')
  const end = entrypoint.indexOf('workspaceService:', start)
  const query = entrypoint.slice(start, end)

  it('consulta a identidade pelo ID autenticado e papel restrito', () => {
    expect(query).toContain('admin_account.id = ${userId}::uuid')
    expect(query).toContain("raw_app_meta_data->>'farol_role' = 'super_admin'")
    expect(query).not.toContain('raw_user_meta_data')
    expect(query).not.toContain('localStorage')
  })

  it('não concede privilégio a e-mail não confirmado, conta excluída ou banida', () => {
    expect(query).toContain('email_confirmed_at IS NOT NULL')
    expect(query).toContain('deleted_at IS NULL')
    expect(query).toContain('is_anonymous IS NOT TRUE')
    expect(query).toContain('banned_until IS NULL OR admin_account.banned_until <= NOW()')
  })

  it('exige TOTP atualmente verificado no banco, além de AAL2 do token', () => {
    expect(query).toContain('FROM auth.mfa_factors AS verified_factor')
    expect(query).toContain('verified_factor.user_id = admin_account.id')
    expect(query).toContain("verified_factor.factor_type = 'totp'")
    expect(query).toContain("verified_factor.status = 'verified'")
  })

  it('a verificação nunca expõe lista de contas ou metadados ao navegador', () => {
    expect(query).toContain('SELECT EXISTS (')
    expect(query).toContain('AS allowed')
    expect(query).not.toContain('SELECT *')
  })
})
