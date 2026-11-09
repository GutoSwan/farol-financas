import { describe, expect, it, vi } from 'vitest'
import { normalizeBrazilianMobile, phoneAuthEnabled, sendPhoneOtp } from '../src/infrastructure/auth/phoneAuth'
import { canAccessWithoutSession } from '../src/router/authNavigation'

describe('Fluxo seguro por celular, preparado mas desligado até configurar SMS', () => {
  it('normaliza celular brasileiro em E.164 sem armazenar número', () => {
    expect(normalizeBrazilianMobile('(15) 99999-9999')).toBe('+5515999999999')
    expect(normalizeBrazilianMobile('+55 (15) 99999-9999')).toBe('+5515999999999')
    expect(normalizeBrazilianMobile('11999999999')).toBe('+5511999999999')
  })

  it('rejeita fixo, DDD inexistente, caracteres e telefone estrangeiro', () => {
    for (const phone of ['(15) 3333-3333', '00000000000', '9999999999', '+1 415 555 1234', 'abc', '']) {
      expect(() => normalizeBrazilianMobile(phone)).toThrow()
    }
  })

  it('não oferece envio SMS enquanto o provedor estiver desabilitado', async () => {
    if (!phoneAuthEnabled) {
      await expect(sendPhoneOtp('(15) 99999-9999', 'login')).rejects.toThrow(/ainda não ativado/)
    }
  })

  it('rotas de telefone permanecem disponíveis para visitantes sem sessão', () => {
    expect(canAccessWithoutSession('/entrar/celular')).toBe(true)
    expect(canAccessWithoutSession('/cadastro/celular')).toBe(true)
    expect(canAccessWithoutSession('/recuperar-celular')).toBe(true)
  })
})
