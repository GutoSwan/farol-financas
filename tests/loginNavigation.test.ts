import { describe, expect, it } from 'vitest'
import { shouldRedirectLoggedInVisitor } from '../src/router/authNavigation'
import page from '../src/presentation/pages/AuthPage.vue?raw'
import router from '../src/router/index.ts?raw'

describe('Login familiar', () => {
  it('entra com e-mail e senha e abre a Visão geral', () => {
    expect(page).toContain('await signIn(email.value, password.value)')
    expect(page).toContain("await router.replace('/')")
  })
  it('não oferece criação de conta, telefone ou administrador', () => {
    expect(page).not.toContain('to="/cadastro"')
    expect(page).not.toContain('entrar/celular')
    expect(page).not.toContain('signUp(')
    expect(router).toContain("{ path: '/cadastro', redirect: '/entrar' }")
    expect(shouldRedirectLoggedInVisitor('/entrar', true)).toBe(true)
  })
  it('exige usuário remoto para dados financeiros', () => {
    expect(router).toContain('await supabase.auth.getUser()')
    expect(router).toContain("if (!validatedUser)")
    expect(router).toContain("access === 'different-user'")
    expect(router).toContain("return { path: '/dados-online', replace: true }")
  })
})
