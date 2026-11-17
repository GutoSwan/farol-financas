import { describe, expect, it } from 'vitest'
import { canAccessWithoutSession, shouldRedirectLoggedInVisitor } from './authNavigation'

describe('navegação do Farol Familiar com duas contas', () => {
  it.each(['/entrar', '/confirmar-email', '/recuperar-senha', '/redefinir-senha'])(
    'permite %s sem login para recuperar acesso',
    (path) => expect(canAccessWithoutSession(path)).toBe(true),
  )

  it.each(['/', '/conta', '/lancamentos', '/presentes', '/verificar-2fa', '/cadastro',
    '/entrar/celular', '/configurar-2fa', '/dados-online'])(
    'não torna %s uma rota pública',
    (path) => expect(canAccessWithoutSession(path)).toBe(false),
  )

  it('redireciona somente o login já autenticado', () => {
    expect(shouldRedirectLoggedInVisitor('/entrar', true)).toBe(true)
    expect(shouldRedirectLoggedInVisitor('/entrar', false)).toBe(false)
    expect(shouldRedirectLoggedInVisitor('/recuperar-senha', true)).toBe(false)
  })
})
