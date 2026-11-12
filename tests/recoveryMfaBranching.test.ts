import { describe, expect, it } from 'vitest'
import { recoveryAccessTokenFromFragment } from '../src/domain/auth/recoveryCallback'
import { readFileSync } from 'node:fs'
const auth = readFileSync(new URL('../src/presentation/composables/useAuth.ts', import.meta.url), 'utf8')
const supabase = readFileSync(new URL('../src/infrastructure/auth/supabase.ts', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/presentation/pages/AuthPage.vue', import.meta.url), 'utf8')
const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature123'
describe('Retorno de link de recuperação e bifurcação por MFA', () => {
  it('captura o token apenas para recuperação, sem usar a presença da URL como autorização', () => {
    expect(recoveryAccessTokenFromFragment('/redefinir-senha', '#type=recovery&access_token='+jwt)).toBe(jwt)
    expect(recoveryAccessTokenFromFragment('/redefinir-senha', '#type=signup&access_token='+jwt)).toBeNull()
    expect(recoveryAccessTokenFromFragment('/redefinir-senha', '#type=recovery')).toBeNull()
    expect(recoveryAccessTokenFromFragment('/conta', '#type=recovery&access_token='+jwt)).toBeNull()
    expect(recoveryAccessTokenFromFragment('/redefinir-senha', '#type=recovery&access_token=x')).toBeNull()
    expect(recoveryAccessTokenFromFragment('/redefinir-senha', '#type=recovery&access_token='+jwt+'&access_token='+jwt)).toBeNull()
  })
  it('consome callback somente quando a sessão do SDK possui o mesmo token', () => {
    expect(supabase).toContain('accessToken !== recoveryRedirectAccessToken')
    expect(supabase).toContain('recoveryRedirectAccessToken = null')
    expect(auth).toContain('claimRecoveryCallbackSession(nextSession?.access_token)')
    expect(auth).toContain('claimRecoveryCallbackSession(data.session?.access_token)')
  })
  it('com TOTP encaminha para Meu perfil somente após AAL2', () => {
    expect(auth).toContain("assurance.currentLevel !== 'aal2'")
    expect(page).toContain('await verifyRecoveryMfa(recoveryMfaFactorId.value, recoveryMfaCode.value)')
    expect(page).toContain("await router.replace('/conta')")
    expect(page).toContain('if (recoveryMfaRequired.value && recoveryMfaVerified.value)')
    expect(page).toContain('@submit.prevent="submitProfilePassword"')
    expect(auth).toContain('async function changePasswordInProfile(password: string)')
    expect(auth).toContain("factors.length === 0 || assurance.currentLevel !== 'aal2'")
  })
  it('sem TOTP mantém a redefinição somente após e-mail validado na mesma tela', () => {
    expect(page).toContain("recoveringPassword && recoveryMfaChecked && !recoveryMfaRequired && recoveryMfaVerified")
    expect(auth).toContain('if (!recoveringPassword.value)')
    expect(auth).toContain('async function updatePassword(password: string)')
  })
  it('após atualizar senha em Meu perfil exige novo login', () => {
    expect(auth).toContain("await auth.signOut({ scope: 'local' })")
    expect(page).toContain("await router.replace('/entrar')")
    expect(page).toContain('passwordJustChanged')
  })
})
