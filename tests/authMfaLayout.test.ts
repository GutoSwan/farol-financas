import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/presentation/pages/AuthPage.vue', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/assets/styles/auth-redesign.css', import.meta.url), 'utf8')

describe('Layout de recuperação com autenticador', () => {
  it('empilha título, instrução, código e botão em uma coluna', () => {
    expect(page).toContain('auth-warning auth-step-panel auth-mfa-step')
    expect(page).toContain('auth-step-heading')
    expect(styles).toContain('.auth-screen .auth-step-panel {')
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(styles).toContain('.auth-screen .auth-step-panel .auth-full-button')
  })
  it('não oferece a visão geral durante uma sessão de recuperação', () => {
    expect(page).toContain("mode !== 'login' && mode !== 'reset'")
  })
})
