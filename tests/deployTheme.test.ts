import { describe, expect, it } from 'vitest'
import vercelJson from '../vercel.json?raw'
import main from '../src/main.ts?raw'

const config = JSON.parse(vercelJson) as {
  framework: string
  outputDirectory: string
  buildCommand: string
  rewrites: Array<{source: string; destination: string}>
}

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
  it('carrega o CSS de temas da lateral depois dos arquivos anteriores', () => {
    // O Vitest na configuração node ignora conteúdo de arquivos CSS.
    // Testamos a importação e a precedência aqui; a paleta exige inspeção visual.
    expect(main).toContain("import './assets/styles/sidebar-theme.css'")
    expect(main.indexOf("import './assets/styles/sidebar-theme.css'"))
      .toBeGreaterThan(main.indexOf("import './assets/styles/sticky-sidebar.css'"))
  })
})
