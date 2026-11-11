import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { canAccessWithoutSession } from '../src/router/authNavigation'

const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const auth = readFileSync(new URL('../src/presentation/composables/useAuth.ts', import.meta.url), 'utf8')

describe('Privacidade ao sair ou trocar de conta', () => {
  it('mantém as páginas públicas acessíveis mesmo com sessão encerrada', () => {
    expect(canAccessWithoutSession('/entrar')).toBe(true)
    expect(canAccessWithoutSession('/recuperar-senha')).toBe(true)
    expect(canAccessWithoutSession('/confirmar-email')).toBe(true)
    expect(canAccessWithoutSession('/')).toBe(false)
    expect(canAccessWithoutSession('/relatorios')).toBe(false)
    expect(canAccessWithoutSession('/dados-online')).toBe(false)
  })
  it('oculta a rota financeira imediatamente após encerrar a sessão', () => {
    expect(app).toContain('const canRenderCurrentPage = computed(')
    expect(app).toContain('ready.value && !!user.value?.id && !privateViewSuspended.value')
    expect(app).toContain('<RouterView v-if="canRenderCurrentPage" />')
    expect(app).toContain("flush: 'sync'")
    expect(app).toContain('privateViewSuspended.value = true')
    expect(app).toContain("await router.replace(nextPath)")
  })
  it('invalida acesso local no logout e impede restauração por resposta antiga', () => {
    expect(auth).toContain("if (event === 'SIGNED_OUT') {")
    expect(auth).toContain('setVerifiedLocalUser(null)')
    expect(auth).toContain('authRevision++')
    expect(auth).toContain('authRevision === initialRevision')
  })
  it('troca de identidade não reutiliza dados locais de uma conta diferente', () => {
    expect(app).toContain('setVerifiedLocalUser(null)')
    expect(app).toContain("currentId ? '/dados-online' : '/entrar'")
    expect(app).toContain('previousId === currentId')
  })
})
