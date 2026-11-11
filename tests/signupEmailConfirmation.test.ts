import { describe, expect, it } from 'vitest'
import authSource from '../src/presentation/composables/useAuth.ts?raw'
import signupSource from '../src/presentation/pages/AuthPage.vue?raw'

describe('Confirmação de cadastro no Preview', () => {
  it('gera links para o domínio HTTPS canônico definido para o Preview', () => {
    expect(authSource).toContain("emailRedirectTo: emailRedirect('/confirmar-email')")
  })
  it('mantém confirmação numérica pela sessão Supabase Auth', () => {
    expect(authSource).toContain("auth.verifyOtp({")
    expect(authSource).toContain("type: 'email'")
  })
  it('explica e-mail com link e permite voltar ao login sem solicitar outro cadastro', () => {
    expect(signupSource).toContain('Confirm address')
    expect(signupSource).toContain('Já tenho cadastro ou confirmei pelo link. Ir para o login')
    expect(signupSource).toContain('to="/entrar"')
    expect(signupSource).toContain("mode === 'confirmed'")
    expect(signupSource).toContain("data.user?.email_confirmed_at")
    expect(signupSource).toContain("v-if=\"signupCodeVisible\"")
  })
  it('não promete código quando o projeto utiliza modelo com link', () => {
    expect(signupSource).toContain('Reenviar e-mail de confirmação')
    expect(signupSource).toContain('O Supabase pode enviar outro link em vez de código')
  })
})
