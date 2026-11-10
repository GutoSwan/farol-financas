import { describe, expect, it } from 'vitest'
import { isFarolAdmin, isFarolSuperAdmin } from '../src/domain/auth/adminAccess'
import routes from '../src/router/index.ts?raw'
import layout from '../src/presentation/layouts/AppLayout.vue?raw'
import profile from '../src/presentation/pages/AuthPage.vue?raw'
import admin from '../src/presentation/pages/AdminPage.vue?raw'
import securityPage from '../src/presentation/pages/AccountSecurityPage.vue?raw'
import gifts from '../src/presentation/pages/GiftsPage.vue?raw'
import nav from '../src/presentation/components/BackNavigation.vue?raw'
import { readFileSync } from 'node:fs'
const calendarCss = readFileSync(new URL('../src/assets/styles/ux-admin-calendar.css', import.meta.url), 'utf8')

describe('Navegação e separação dos privilégios', () => {
  it('a conta de Presentes não vira Super Admin', () => {
    expect(isFarolAdmin({app_metadata:{farol_role:'administrador'}})).toBe(true)
    expect(isFarolSuperAdmin({app_metadata:{farol_role:'administrador'}})).toBe(false)
    expect(isFarolSuperAdmin({app_metadata:{farol_role:'super_admin'}})).toBe(true)
    expect(isFarolAdmin({app_metadata:{farol_role:'super_admin'}})).toBe(true)
    expect(isFarolSuperAdmin({app_metadata:{farol_role:'viewer'}})).toBe(false)
    expect(isFarolSuperAdmin({app_metadata:{}})).toBe(false)
    expect(isFarolSuperAdmin(null)).toBe(false)
  })

  it('rotas de backup e administração exigem Super Admin no servidor', () => {
    expect(routes).toContain("requiresSuperAdmin: true")
    expect(routes).toContain("path: '/administracao'")
    expect(routes).toContain("path: 'backup', component: LegacyBackupPage")
    expect(routes).toContain("path: 'seguranca', component: AccountSecurityPage")
    expect(routes).toContain("path: 'dados', component: AdminCloudPage")
    expect(routes).toContain("path: 'backup-local'")
    expect(routes).toContain("verifySuperAdminAccess()")
    expect(routes).toContain("isFarolSuperAdmin(data.user)")
    expect(routes).toContain("component: AdminLayout")
    expect(admin).toContain('verifySuperAdminAccess()')
    expect(admin).toContain('v-else-if="!authorized"')
  })

  it('o perfil fica simples e a segurança tem página separada', () => {
    expect(profile).toContain('to="/seguranca"')
    expect(securityPage).toContain('v-if="!route.path.startsWith(\'/administracao\')"')
    expect(profile).toContain('to="/dados-online"')
    expect(profile).not.toContain('<TotpSettings />')
    expect(profile).not.toContain('<PhoneLinkPanel />')
    expect(profile).not.toContain('<OnlineWorkspacesPanel />')
    expect(layout).toContain('v-if="isSuperAdmin" to="/administracao"')
    expect(layout).toContain('v-if="isSuperAdmin" class="sidebar-backup-section"')
    expect(layout).toContain('<BackNavigation v-if="route.path !==')
  })

  it('toda página do layout tem volta e início sem URLs externas', () => {
    expect(nav).toContain('Voltar')
    expect(nav).toContain('to="/"')
    expect(nav).toContain("!last.startsWith('//')")
    expect(layout).toContain('<BackNavigation')
  })

  it('o modal de Presentes possui três maneiras de fechar', () => {
    expect(gifts).toContain('@click="closeChooser"')
    expect(gifts).toContain('@click.self="closeChooser"')
    expect(gifts).toContain('@keydown.esc.prevent.stop="closeChooser"')
    expect(gifts).toContain('Voltar para a visão geral sem escolher')
  })

  it('o calendário usa alto contraste nos dois temas', () => {
    expect(calendarCss).toContain(':root[data-theme="dark"] .calendar-page')
    expect(calendarCss).toContain('--calendar-ink')
    expect(calendarCss).toContain('.calendar-event-count')
    expect(calendarCss).toContain('.calendar-holiday')
    expect(calendarCss).toContain(':focus-visible')
  })
})
