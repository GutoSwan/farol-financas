import { describe, expect, it } from 'vitest'
import page from '../src/presentation/pages/AccountSecurityPage.vue?raw'
import { readFileSync } from 'node:fs'
const css = readFileSync(new URL('../src/assets/styles/security-mobile.css', import.meta.url), 'utf8')
import main from '../src/main.ts?raw'
import totp from '../src/presentation/components/TotpSettings.vue?raw'
import phone from '../src/presentation/components/PhoneLinkPanel.vue?raw'

describe('Tela Segurança e acesso responsiva do Farol financeiro', () => {
  it('apresenta cartões separados para autenticadores e celular', () => {
    expect(page).toContain('class="security-hero"')
    expect(page).toContain('class="security-section-grid"')
    expect(page).toContain('<TotpSettings />')
    expect(page).toContain('<PhoneLinkPanel />')
    expect(page).toContain('fallback="/conta"')
  })
  it('preserva operações MFA, autorização e controles de recuperação', () => {
    expect(totp).toContain('listVerifiedTotpFactors')
    expect(totp).toContain('verifyTotpCode(')
    expect(totp).toContain('removeVerifiedTotpFactor(')
    expect(totp).toContain("confirmation.value !== 'REMOVER'")
    expect(phone).toContain('phoneAuthEnabled')
    expect(phone).toContain('confirmPhoneLink')
  })
  it('possui grade de uma coluna no celular, botões para toque e inputs 16px', () => {
    expect(css).toContain('@media (max-width: 600px)')
    expect(css).toContain('grid-template-columns: minmax(0,1fr)')
    expect(css).toContain('min-height: 48px')
    expect(css).toContain('font-size: 16px')
    expect(css).toContain('env(safe-area-inset-bottom)')
  })
  it('carrega a folha depois dos temas e não usa paleta do Farol Admin', () => {
    expect(main).toContain("import './assets/styles/security-mobile.css'")
    expect(main.indexOf('security-mobile.css')).toBeGreaterThan(main.indexOf('sidebar-theme.css'))
    expect(css).toContain(':root[data-theme="dark"] .account-security-page')
    expect(css).toContain('--sec-accent: #873953')
    expect(css).not.toContain('#51ebc8')
  })
})
