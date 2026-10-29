import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  framework: string
  outputDirectory: string
  buildCommand: string
  rewrites: Array<{source: string; destination: string}>
}
const sidebar = readFileSync(new URL('../src/assets/styles/sidebar-theme.css', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')

describe('Preparação do Farol para Vercel', () => {
  it('gera frontend Vite na pasta dist', () => {
    expect(config.framework).toBe('vite')
    expect(config.outputDirectory).toBe('dist')
    expect(config.buildCommand).toBe('npm run build')
  })

  it('serve todas as rotas Vue como SPA, sem reescrever URLs da API como HTML', () => {
    const routes = [
      '/contas-mensais', '/gastos-fixos', '/lancamentos', '/cartoes', '/orcamentos',
      '/relatorios', '/entrar', '/cadastro', '/recuperar-senha',
      '/redefinir-senha', '/conta',
    ]
    expect(config.rewrites.map(rule => rule.source).sort()).toEqual(routes.sort())
    expect(config.rewrites.every(rule => rule.destination === '/index.html')).toBe(true)
    expect(config.rewrites.some(rule => rule.source.includes('api') || rule.source.includes('*'))).toBe(false)
  })
})

describe('Barra lateral com tema duplo', () => {
  it('carrega o CSS depois das versões anteriores e abrange menu desktop/mobile', () => {
    expect(main.indexOf("import './assets/styles/sidebar-theme.css'"))
      .toBeGreaterThan(main.indexOf("import './assets/styles/sticky-sidebar.css'"))
    expect(sidebar).toContain(':root[data-theme="light"] .sidebar')
    expect(sidebar).toContain(':root[data-theme="dark"] .sidebar .brand')
    expect(sidebar).toContain(':root[data-theme="light"] .sidebar-mobile-close')
    expect(sidebar).toContain(':root[data-theme="light"] .sidebar-workspace .workspace-select')
    expect(sidebar).toContain(':root[data-theme="light"] .sidebar-profile-menu')
  })
})
