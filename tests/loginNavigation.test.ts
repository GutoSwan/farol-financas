import { describe, expect, it } from 'vitest'
import { shouldRedirectLoggedInVisitor } from '../src/router/authNavigation'
import authPage from '../src/presentation/pages/AuthPage.vue?raw'
import routerSource from '../src/router/index.ts?raw'

describe('Fluxo de login do Farol', () => {
  it('redireciona para a Visão geral após login, não para o perfil', () => {
    expect(authPage).toContain("await signIn(email.value, password.value)")
    expect(authPage).toContain("await router.replace('/')")
    expect(authPage).not.toContain("await router.replace('/conta')")
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
