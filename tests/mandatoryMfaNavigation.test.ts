import { describe, expect, it } from 'vitest'
import { requiredMfaRedirect } from '../src/router/mfaNavigation'

describe('Proteção 2FA nas telas financeiras', () => {
  it('não libera Visão geral sem autenticador cadastrado', () => {
    expect(requiredMfaRedirect('/', true, 'aal1', 'aal1')).toBe('/conta')
  })
  it('bloqueia acesso ao calendário, lançamentos e dados online sem AAL2', () => {
    for (const path of ['/lancamentos', '/calendario', '/dados-online']) {
      expect(requiredMfaRedirect(path, true, 'aal1', 'aal1')).toBe('/conta')
    }
  })
  it('não permite vincular dados locais antes da segunda etapa', () => {
    expect(requiredMfaRedirect('/vincular-dados-locais', true, 'aal1', 'aal1')).toBe('/conta')
  })
  it('permite acessar o perfil para cadastrar autenticador', () => {
    expect(requiredMfaRedirect('/conta', false, 'aal1', 'aal1')).toBe(null)
  })
  it('exige desafio para conta com autenticador, mas sessão AAL1', () => {
    expect(requiredMfaRedirect('/', true, 'aal1', 'aal2')).toBe('/verificar-2fa')
    expect(requiredMfaRedirect('/conta', false, 'aal1', 'aal2')).toBe('/verificar-2fa')
    expect(requiredMfaRedirect('/verificar-2fa', false, 'aal1', 'aal2')).toBe(null)
  })
  it('libera finanças quando a sessão foi comprovada AAL2', () => {
    expect(requiredMfaRedirect('/', true, 'aal2', 'aal2')).toBe(null)
    expect(requiredMfaRedirect('/dados-online', true, 'aal2', 'aal2')).toBe(null)
  })
  it('não deixa usuário sem fator em tela de desafio impossível', () => {
    expect(requiredMfaRedirect('/verificar-2fa', false, 'aal1', 'aal1')).toBe('/conta')
  })
  it('falha de forma fechada quando o nível de proteção é desconhecido', () => {
    expect(requiredMfaRedirect('/', true, null, null)).toBe('/conta')
  })
})
