import { describe, expect, it } from 'vitest'
import { shouldRedirectLoggedInVisitor } from '../src/router/authNavigation'
import authPage from '../src/presentation/pages/AuthPage.vue?raw'
import routerSource from '../src/router/index.ts?raw'

describe('Fluxo de login do Farol', () => {
  it('redireciona para a Visão geral após login, não para o perfil', () => {
    const loginStart = authPage.indexOf("if (props.mode === 'login') {")
    const signupStart = authPage.indexOf("} else if (props.mode === 'signup')", loginStart)
    expect(loginStart).toBeGreaterThan(-1)
    expect(signupStart).toBeGreaterThan(loginStart)
    const loginHandler = authPage.slice(loginStart, signupStart)
    expect(loginHandler).toContain("await signIn(email.value, password.value)")
    expect(loginHandler).toContain("await router.replace('/')")
    expect(loginHandler).not.toContain("await router.replace('/conta')")
  })

  it('direciona visitantes já autenticados que abrem login ou cadastro', () => {
    expect(shouldRedirectLoggedInVisitor('/entrar', true)).toBe(true)
    expect(shouldRedirectLoggedInVisitor('/cadastro', true)).toBe(true)
    expect(shouldRedirectLoggedInVisitor('/entrar', false)).toBe(false)
    expect(shouldRedirectLoggedInVisitor('/cadastro', false)).toBe(false)
    expect(routerSource).toContain('router.beforeEach(async (to) =>')
  })

  it('não interfere na recuperação de senha, edição do perfil ou dashboard', () => {
    for (const path of ['/redefinir-senha', '/recuperar-senha', '/conta', '/']) {
      expect(shouldRedirectLoggedInVisitor(path, true)).toBe(false)
    }
  })
})
