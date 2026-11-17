import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const auth = readFileSync(new URL('../src/presentation/composables/useAuth.ts',import.meta.url),'utf8')
const page = readFileSync(new URL('../src/presentation/pages/AuthPage.vue',import.meta.url),'utf8')
const router = readFileSync(new URL('../src/router/index.ts',import.meta.url),'utf8')
const app = readFileSync(new URL('../src/App.vue',import.meta.url),'utf8')
const vercel = readFileSync(new URL('../vercel.json',import.meta.url),'utf8')

describe('Recuperação por e-mail sem autenticador', () => {
  it('usa o redirect de recuperação e confirma token pelo Supabase', () => {
    expect(auth).toContain("redirectTo: emailRedirect('/redefinir-senha')")
    expect(auth).toContain("token_hash: hash")
    expect(auth).toContain("type: 'recovery'")
    expect(page).toContain('confirmRecoveryLink')
  })
  it('restringe a sessão temporária de recuperação à troca de senha', () => {
    expect(router).toContain("if (recoveringPassword.value && to.path !== '/redefinir-senha'")
    expect(app).toContain("router.replace('/redefinir-senha')")
    expect(auth).toContain('if (!recoveringPassword.value)')
    expect(page).toContain("recoveringPassword && !passwordResetDone")
  })
  it('confere identidade novamente e encerra a sessão após salvar', () => {
    expect(auth).toContain('await Promise.all([auth.getSession(), auth.getUser()])')
    expect(auth).toContain("await auth.signOut({ scope: 'local' })")
    expect(page).toContain("recoveryLinkInput.value = ''")
  })
  it('exige TOTP e AAL2 na recuperação de uma conta com MFA', () => {
    expect(auth).toContain('auth.mfa.getAuthenticatorAssuranceLevel()')
    expect(auth).toContain('auth.mfa.listFactors()')
    expect(auth).toContain('auth.mfa.challengeAndVerify({ factorId: factor.id')
    expect(auth).toContain("recoveryMfaDecision(levels) === 'required'")
    expect(page).toContain('confirmAuthenticator')
    expect(page).toContain("recoveryMfaStatus === 'required'")
    expect(page).toContain("recoveryMfaStatus === 'ready'")
  })
  it('exige uma consulta de vazamentos antes de alterar a senha no Supabase', () => {
    expect(auth).toContain('await assertPasswordNotLeaked(password)')
    expect(auth.indexOf('await assertPasswordNotLeaked(password)')).toBeLessThan(
      auth.indexOf('await auth.updateUser({ password })'),
    )
    expect(page).toContain(':minlength="MIN_NEW_PASSWORD_LENGTH"')
    expect(vercel).toContain('https://api.pwnedpasswords.com')
  })
})
