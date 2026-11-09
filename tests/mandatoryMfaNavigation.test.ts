import { describe, expect, it } from 'vitest'
import { requiredMfaRedirect } from '../src/router/mfaNavigation'

describe('Proteção 2FA e reconfiguração antes das finanças', () => {
  it('redireciona conta sem fator confirmado para configurar TOTP após a senha', () => {
    for (const path of ['/', '/lancamentos', '/calendario', '/dados-online', '/conta', '/vincular-dados-locais']) {
      expect(requiredMfaRedirect(path, true, 'aal1', 'aal1', 0)).toBe('/configurar-2fa')
    }
    expect(requiredMfaRedirect('/configurar-2fa', false, 'aal1', 'aal1', 0)).toBe(null)
    expect(requiredMfaRedirect('/verificar-2fa', false, 'aal1', 'aal1', 0)).toBe('/configurar-2fa')
  })

  it('não permite reconfigurar enquanto há fator antigo no Supabase e sessão AAL1', () => {
    for (const path of ['/', '/conta', '/dados-online', '/configurar-2fa']) {
      expect(requiredMfaRedirect(path, true, 'aal1', 'aal2', 1)).toBe('/verificar-2fa')
    }
    expect(requiredMfaRedirect('/verificar-2fa', false, 'aal1', 'aal2', 1)).toBe(null)
  })

  it('aceita sessão com fator verificado em AAL2', () => {
    expect(requiredMfaRedirect('/', true, 'aal2', 'aal2', 1)).toBe(null)
    expect(requiredMfaRedirect('/conta', false, 'aal2', 'aal2', 1)).toBe(null)
    expect(requiredMfaRedirect('/dados-online', true, 'aal2', 'aal2', 1)).toBe(null)
    expect(requiredMfaRedirect('/configurar-2fa', false, 'aal2', 'aal2', 1)).toBe('/')
    expect(requiredMfaRedirect('/verificar-2fa', false, 'aal2', 'aal2', 1)).toBe('/')
  })

  it('remover último fator no Supabase permite cadastrar novamente sem abrir as finanças', () => {
    expect(requiredMfaRedirect('/', true, 'aal1', 'aal1', 0)).toBe('/configurar-2fa')
    expect(requiredMfaRedirect('/verificar-2fa', false, 'aal1', 'aal1', 0)).toBe('/configurar-2fa')
  })

  it('se não for possível obter fatores, falha de modo fechado', () => {
    expect(requiredMfaRedirect('/', true, null, null, null)).toBe('/verificar-2fa')
    expect(requiredMfaRedirect('/conta', false, 'aal1', 'aal1', null)).toBe('/verificar-2fa')
    expect(requiredMfaRedirect('/configurar-2fa', false, null, null, null)).toBe(null)
  })
})
