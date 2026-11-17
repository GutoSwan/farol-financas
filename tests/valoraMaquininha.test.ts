import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const layout = readFileSync(new URL('../src/presentation/layouts/AppLayout.vue', import.meta.url), 'utf8')
const router = readFileSync(new URL('../src/router/index.ts', import.meta.url), 'utf8')
const conditional = readFileSync(new URL('../src/presentation/pages/CardsWorkspacePage.vue', import.meta.url), 'utf8')
const machine = readFileSync(new URL('../src/presentation/pages/MaquininhaPage.vue', import.meta.url), 'utf8')

describe('Maquininha apenas no espaço Valora3D', () => {
  it('troca o rótulo e a tela de Cartões apenas na Valora3D', () => {
    expect(layout).toContain("link.to === '/cartoes' && isValoraWorkspace ? 'Maquininha' : link.label")
    expect(router).toContain("{ path: 'cartoes', component: CardsWorkspacePage")
    expect(conditional).toContain('VALORA3D_WORKSPACE_ID')
    expect(conditional).toContain("=== 'valora3d'")
    expect(conditional).toContain('<MaquininhaPage v-if="isValora" />')
    expect(conditional).toContain('<ComingSoonPage v-else title="Cartões de crédito" />')
  })

  it('não confunde status pendente com pagamentos realmente recebidos', () => {
    expect(machine).toContain('ainda não conectada')
    expect(machine).toContain('Nenhum recebimento sincronizado')
    expect(machine).toContain('Mercado Pago Point')
    expect(machine).not.toContain('access_token')
    expect(machine).not.toContain('APP_USR')
  })

  it('restringe Presentes à família, inclusive quando a rota é aberta diretamente', () => {
    expect(layout).toContain('v-if="!isValoraWorkspace && canOpenGifts" to="/presentes"')
    expect(layout).toContain("if (valora && path === '/presentes')")
    expect(layout).toContain("route.path === '/presentes'")
    expect(layout).toContain('<RouterView v-else />')
  })
})
