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
    expect(layout).toContain('FINANÇAS · VALORA3D')
    expect(layout).not.toContain('valora-space-banner')
    expect(layout).toContain('v-if="!isValoraWorkspace && canOpenGifts" to="/presentes"')
    expect(layout).toContain("if (valora && path === '/presentes')")
  })
  it('usa roxo e amarelo sem apagar a opção de tema claro/escuro', () => {
    expect(brandStyles).toContain('#ffe044')
    expect(brandStyles).toContain('#4a276b')
    expect(brandStyles).toContain('Arial Rounded MT Bold')
    expect(brandStyles).toContain('font-style: normal')
    expect(brandStyles).toContain(':root[data-theme="light"] .shell--valora .main { background: #fff9e6;')
    expect(brandStyles).toContain(':root[data-theme="dark"] .shell--valora .main { background: #150d20;')
    expect(brandStyles).toContain('--farol-card: #2a1939')
    expect(brandStyles).toContain('--farol-text: #f5e9ff')
    expect(brandStyles).toContain('input::placeholder')
    expect(brandStyles).toContain(':root[data-theme="light"] .shell--valora')
    expect(brandStyles).toContain(':root[data-theme="dark"] .shell--valora')
    expect(brandStyles).not.toContain('printer')
    expect(entry).toContain("import './assets/styles/valora3d.css'")
    expect(entry.indexOf("import './assets/styles/valora3d.css'"))
      .toBeGreaterThan(entry.indexOf("import './assets/styles/sidebar-theme.css'"))
  })
})
