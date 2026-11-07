import { describe, expect, it } from 'vitest'
import authSource from '../src/presentation/composables/useAuth.ts?raw'
import signupSource from '../src/presentation/pages/AuthPage.vue?raw'

describe('Confirmação de cadastro no Preview', () => {
  it('gera links para o mesmo domínio HTTPS do frontend que iniciou o cadastro', () => {
    expect(authSource).toContain('emailRedirectTo: `${window.location.origin}/entrar`')
  })
  it('mantém confirmação numérica pela sessão Supabase Auth', () => {
    expect(authSource).toContain("auth.verifyOtp({")
    expect(authSource).toContain("type: 'email'")
  })
  it('explica e-mail com link e permite voltar ao login sem solicitar outro cadastro', () => {
    expect(signupSource).toContain('Confirm address')
    expect(signupSource).toContain('Já confirmei pelo link. Ir para o login')
    expect(signupSource).toContain('to="/entrar"')
  })
  it('não promete código quando o projeto utiliza modelo com link', () => {
    expect(signupSource).toContain('Reenviar e-mail de confirmação')
    expect(signupSource).toContain('O Supabase pode enviar outro link em vez de código')
  })
})
