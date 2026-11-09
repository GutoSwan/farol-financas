import { describe, expect, it } from 'vitest'
import phoneSource from '../src/infrastructure/auth/phoneAuth.ts?raw'
import phonePage from '../src/presentation/pages/PhoneAuthPage.vue?raw'
import profilePhone from '../src/presentation/components/PhoneLinkPanel.vue?raw'
import authSource from '../src/presentation/composables/useAuth.ts?raw'
import loginPage from '../src/presentation/pages/AuthPage.vue?raw'
import layout from '../src/presentation/layouts/AppLayout.vue?raw'
import style from '../src/assets/styles/auth-redesign.css?raw'

describe('Autenticação por telefone: contrato e barreiras de segurança', () => {
  it('não habilita SMS sem provedor explicitamente configurado', () => {
    expect(phoneSource).toContain("VITE_ENABLE_PHONE_AUTH === 'true'")
    expect(phonePage).toContain('!phoneAuthEnabled || !authConfigured')
  })
  it('não cria contas ao entrar ou recuperar por SMS', () => {
    expect(phoneSource).toContain("shouldCreateUser: flow === 'signup'")
    expect(phoneSource).toContain("channel: 'sms'")
    expect(phoneSource).toContain("type: 'sms'")
  })
  it('recuperação por SMS não ignora o TOTP existente', () => {
    expect(phonePage).toContain("router.replace('/verificar-2fa')")
    expect(phonePage).toContain('SMS nunca substitui')
  })
  it('associação de celular exige AAL2 e verificação phone_change', () => {
    expect(phoneSource.match(/currentLevel !== 'aal2'/g)?.length).toBe(2)
    expect(phoneSource).toContain("type: 'phone_change'")
    expect(phoneSource).toContain("auth.updateUser({ phone })")
    expect(profilePhone).toContain('requestPhoneLink(')
    expect(profilePhone).toContain('confirmPhoneLink(')
  })
  it('não enumera e-mails existentes durante cadastro', () => {
    expect(authSource).not.toContain('auth.admin.listUsers')
    expect(authSource).toContain('Evitar consulta de existência de e-mail')
    expect(loginPage).toContain('Por segurança não verificamos publicamente')
    expect(loginPage).toContain('recuperar acesso')
  })
  it('visual segue o tema claro/escuro com botão vinho e espaço nomeado', () => {
    expect(style).toContain(':root[data-theme="light"] .auth-screen')
    expect(style).toContain(':root[data-theme="dark"] .auth-screen')
    expect(style).toContain('.auth-method-choice')
    expect(style).toContain('.auth-theme-button')
    expect(layout).toContain('Novo espaço')
    expect(loginPage).toContain('toggleTheme')
  })
})
