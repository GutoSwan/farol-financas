import { describe, expect, it } from 'vitest'
import { routeDocumentTitle } from '../src/router/documentTitle'
import routes from '../src/router/index.ts?raw'
import adminLayout from '../src/presentation/layouts/AdminLayout.vue?raw'
import adminPage from '../src/presentation/pages/AdminPage.vue?raw'
import adminCloud from '../src/presentation/pages/AdminCloudPage.vue?raw'
import { readFileSync } from 'node:fs'
const styles = readFileSync(new URL('../src/assets/styles/admin-inverted.css', import.meta.url), 'utf8')
import main from '../src/main.ts?raw'
import vercelJson from '../vercel.json?raw'

describe('Central Super Admin claramente distinta do Farol normal', () => {
  it('usa nome próprio na aba e títulos normais fora do console', () => {
    expect(routeDocumentTitle('/entrar')).toBe('Farol Finanças • Entrar')
    expect(routeDocumentTitle('/administracao')).toContain('SUPER ADMIN | Painel')
    expect(routeDocumentTitle('/administracao/seguranca','Segurança da conta'))
      .toContain('SUPER ADMIN | Segurança da conta')
    expect(routeDocumentTitle('/administracao/backup','Backup protegido'))
      .toContain('SUPER ADMIN | Backup protegido')
    expect(routeDocumentTitle('/administracao/dados','Dados na nuvem'))
      .toContain('SUPER ADMIN | Dados na nuvem')
    expect(routeDocumentTitle('/conta')).not.toContain('SUPER ADMIN')
    expect(routes).toContain('router.afterEach(')
    expect(routes).toContain('document.title = routeDocumentTitle(')
  })
  it('usa layout e navegação separados em cada página interna', () => {
    expect(routes).toContain("path: '/administracao', component: AdminLayout")
    expect(routes).toContain('requiresSuperAdmin: true')
    expect(routes).toContain("path: 'backup', component: LegacyBackupPage")
    expect(routes).toContain('requiresLegacyData: true')
    expect(routes).toContain("path: 'seguranca', component: AccountSecurityPage")
    expect(routes).toContain("path: 'dados', component: AdminCloudPage")
    expect(adminPage).toContain('to="/administracao/backup"')
    expect(adminPage).toContain('to="/administracao/dados"')
    expect(adminPage).toContain('to="/administracao/seguranca"')
    for(const url of ['/administracao/backup','/administracao/dados','/administracao/seguranca']){
      expect(JSON.parse(vercelJson).rewrites).toEqual(expect.arrayContaining([
        { source: url, destination: '/index.html' }
      ]))
    }
  })
  it('não mistura as opções de Administração com o formulário de login', () => {
    expect(adminLayout).toContain('superadmin-status-strip')
    expect(adminLayout).toContain('Central <span>Super Admin</span>')
    expect(adminLayout).toContain('AMBIENTE DEV • ACESSO RESTRITO')
    expect(adminLayout).toContain('Sair do Super Admin')
    expect(adminLayout).toContain('home-to="/administracao"')
    expect(adminLayout).toContain('aria-current')
  })
  it('não concede consulta global de dados pela interface técnica', () => {
    expect(adminCloud).not.toContain('OnlineFinancePage')
    expect(adminCloud).not.toContain('localStorage')
    expect(adminCloud).toContain('Sair do Super Admin e abrir meus dados no Farol')
    expect(routes).toContain('verifySuperAdminAccess()')
  })
  it('inverte o tema de modo escopado ao console, sem mexer no login', () => {
    expect(styles).toContain('.superadmin-shell')
    expect(styles).toContain('--admin-bg: #0a1320')
    expect(styles).toContain(':root[data-theme="dark"] .superadmin-shell')
    expect(styles).toContain('--admin-bg: #f1f9f6')
    expect(styles).toContain('color-scheme: dark')
    expect(styles).toContain('color-scheme: light')
    expect(styles).toContain('var(--admin-accent)')
    expect(styles).not.toContain('.auth-screen')
    expect(main).toContain("import './assets/styles/admin-inverted.css'")
    expect(main.indexOf('admin-inverted.css')).toBeGreaterThan(main.indexOf('ux-admin-calendar.css'))
  })
})
