import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const root = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
describe('Troca de conta com navegação recusada',()=>{
  it('retém bloqueio visual se o guard interromper navegação',()=>{
    expect(root).toContain('privateViewSuspended.value = true')
    expect(root).toContain('router.currentRoute.value.path !== previousPath')
    expect(root).toContain('!router.currentRoute.value.matched.some(record => record.meta.requiresLegacyData)')
    expect(root).toContain('// Manter o escudo até a pessoa entrar numa rota sem dados locais.')
  })
  it('permite sair da proteção e abrir páginas públicas mesmo com erro de rede',()=>{
    expect(root).toContain("if (canAccessWithoutSession(path)) privateViewSuspended.value = false")
    expect(root).toContain('<RouterView v-if="canRenderCurrentPage" />')
    expect(root).toContain('setVerifiedLocalUser(null)')
  })
})