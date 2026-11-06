import { describe, expect, it } from 'vitest'
import { canAccessWithoutSession, shouldRedirectLoggedInVisitor } from './authNavigation'

describe('navegação do Farol com login obrigatório', () => {
  it.each(['/entrar', '/cadastro', '/recuperar-senha', '/redefinir-senha'])(
    'mantém a rota pública %s disponível antes do login',
    (path) => {
      expect(canAccessWithoutSession(path)).toBe(true)
    },
  )

  it.each(['/', '/conta', '/lancamentos', '/contas-mensais', '/presentes', '/relatorios/detalhes'])(
    'exige sessão para entrar em %s',
    (path) => {
      expect(canAccessWithoutSession(path)).toBe(false)
    },
  )

  it('manda quem já está autenticado do login ou cadastro para a Visão geral', () => {
    expect(shouldRedirectLoggedInVisitor('/entrar', true)).toBe(true)
    expect(shouldRedirectLoggedInVisitor('/cadastro', true)).toBe(true)
  })

  it('não tira visitantes da tela de login nem interrompe recuperação de senha', () => {
    expect(shouldRedirectLoggedInVisitor('/entrar', false)).toBe(false)
    expect(shouldRedirectLoggedInVisitor('/recuperar-senha', true)).toBe(false)
    expect(shouldRedirectLoggedInVisitor('/redefinir-senha', true)).toBe(false)
  })
})
