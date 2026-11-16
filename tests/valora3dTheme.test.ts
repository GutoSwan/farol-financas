import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const layout = readFileSync(new URL('../src/presentation/layouts/AppLayout.vue', import.meta.url), 'utf8')
const brandStyles = readFileSync(new URL('../src/assets/styles/valora3d.css', import.meta.url), 'utf8')
const entry = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')

describe('Identidade exclusiva do espaço financeiro Valora3D', () => {
  it('liga a marca somente ao espaço ativo da loja, inclusive se tiver ID antigo', () => {
    expect(layout).toContain('currentWorkspace')
    expect(layout).toContain('VALORA3D_WORKSPACE_ID')
    expect(layout).toContain("=== 'valora3d'")
    expect(layout).toContain("'shell--valora': isValoraWorkspace")
    expect(layout).toContain('v-if="isValoraWorkspace"')
    expect(layout).toContain('v-else to="/" class="brand"')
    expect(layout).toContain('FINANCEIRO DA LOJA')
    expect(layout).toContain('O financeiro da nossa loja, separado das despesas da casa.')
  })
  it('usa roxo e amarelo sem apagar a opção de tema claro/escuro', () => {
    expect(brandStyles).toContain('#ffe03b')
    expect(brandStyles).toContain('#361153')
    expect(brandStyles).toContain('font-style: italic')
    expect(brandStyles).toContain(':root[data-theme="light"] .shell--valora')
    expect(brandStyles).toContain(':root[data-theme="dark"] .shell--valora')
    expect(brandStyles).not.toContain('printer')
    expect(entry).toContain("import './assets/styles/valora3d.css'")
    expect(entry.indexOf("import './assets/styles/valora3d.css'"))
      .toBeGreaterThan(entry.indexOf("import './assets/styles/sidebar-theme.css'"))
  })
})
