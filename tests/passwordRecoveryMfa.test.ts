import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const useAuth = readFileSync(new URL('../src/presentation/composables/useAuth.ts', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/presentation/pages/AuthPage.vue', import.meta.url), 'utf8')

describe('Recuperação com MFA obrigatório: sessão AAL2 antes da senha', () => {
  it('consulta fatores verificados depois da recuperação por email ou link colado', () => {
    expect(useAuth).toContain("if (event === 'PASSWORD_RECOVERY')")
    expect(useAuth).toContain('async function prepareRecoveryMfa()')
    expect(useAuth).toContain('listVerifiedTotpFactors()')
    expect(useAuth).toContain('getTotpAssurance()')
    expect(page).toContain('watch([recoveringPassword, () => props.mode]')
    expect(page).toContain('await recoverFromEmailLink(recoveryLinkInput.value)')
    expect(page).toContain('await prepareRecoveryMfa()')
  })

  it('permite escolher e verificar um TOTP no servidor, sem remover o autenticador', () => {
    expect(useAuth).toContain('async function verifyRecoveryMfa(factorId: string, code: string)')
    expect(useAuth).toContain('await verifyTotpCode(factorId, code)')
    expect(useAuth).toContain("assurance.currentLevel !== 'aal2'")
    expect(page).toContain('@submit.prevent="confirmRecoveryTotp"')
    expect(page).toContain('Código de seis dígitos do aplicativo autenticador')
    expect(page).toContain('Confirmar autenticador')
    expect(useAuth).not.toContain('mfa.unenroll(')
  })

  it('esconde o formulário de nova senha antes da validação do autenticador', () => {
    expect(page).toContain('recoveryMfaChecked && recoveryMfaRequired && !recoveryMfaVerified')
    expect(page).toContain("mode !== 'reset' || (recoveringPassword && recoveryMfaChecked && recoveryMfaVerified && !passwordResetDone)")
    expect(useAuth).toContain('if (!recoveryMfaChecked.value || !recoveryMfaVerified.value)')
  })

  it('refaz a confirmação AAL2 no Supabase imediatamente antes de atualizar a senha', () => {
    const start = useAuth.indexOf('async function updatePassword(password: string)')
    const end = useAuth.indexOf('async function signOut()', start)
    const code = useAuth.slice(start, end)
    expect(code).toContain('const [assurance, factors, { data: identity, error: identityError }]')
    expect(code).toContain("assurance.currentLevel !== 'aal2'")
    expect(code).toContain('identity.user.id !== data.session.user.id')
    expect(code).toContain("auth.auth.updateUser({ password })")
    expect(code.indexOf("assurance.currentLevel !== 'aal2'")).toBeLessThan(code.indexOf('auth.auth.updateUser({ password })'))
  })

  it('nunca permite retirar o segundo fator de um super admin para completar a recuperação', () => {
    expect(useAuth).toContain('isFarolSuperAdmin(identity.user) && factors.length === 0')
    expect(useAuth).toContain('O Super Admin precisa de um autenticador verificado')
    expect(useAuth).toContain('Sessão AAL2 obrigatória')
  })

  it('encerra a sessão temporária de recuperação depois da alteração', () => {
    expect(useAuth).toContain("auth.auth.signOut({ scope: 'local' })")
    expect(useAuth).toContain('recoveringPassword.value = false')
    expect(page).toContain('Entre novamente e confirme seu autenticador')
  })
})
