import { describe, expect, it } from 'vitest'
import { isFarolAdmin, isFarolSuperAdmin } from '../src/domain/auth/adminAccess'
import { readFileSync } from 'node:fs'
const read = (file: string) => readFileSync(new URL('../'+file, import.meta.url), 'utf8')
const routes=read('src/router/index.ts')
const layout=read('src/presentation/layouts/AppLayout.vue')
const login=read('src/presentation/pages/AuthPage.vue')
const gifts=read('src/presentation/pages/GiftsPage.vue')
const admin=read('admin-web/src/App.vue')

describe('Super Admin usa o Farol normal sem misturar permissões administrativas',()=>{
 it('papeis de Presentes e Super Admin sao distintos',()=>{
  expect(isFarolAdmin({app_metadata:{farol_role:'administrador'}})).toBe(true)
  expect(isFarolSuperAdmin({app_metadata:{farol_role:'administrador'}})).toBe(false)
  expect(isFarolSuperAdmin({app_metadata:{farol_role:'super_admin'}})).toBe(true)
  expect(isFarolAdmin({app_metadata:{farol_role:'super_admin'}})).toBe(false)
 })
 it('site financeiro nao possui entrada administrativa',()=>{
  expect(routes).not.toContain("path: '/administracao'")
  expect(layout).not.toContain('to="/administracao"')
  expect(login).not.toContain('to="/administracao"')
  expect(routes).toContain('isFarolSuperAdmin(data.user) && recoveringPassword.value')
  expect(login).not.toContain('Esta conta pertence exclusivamente ao site Farol Admin.')
  expect(login).not.toContain('if (isFarolSuperAdmin(identity.user))')
  expect(routes).toContain('allowedSuperAdminRecoveryRoute(')
  expect(routes).toContain("superAdminRecoveryProfile = to.path === '/conta'")
  expect(routes).toContain("data.currentLevel !== 'aal2' || factors.length === 0")
  expect(login).toContain('restrictedSuperAdminRecovery')
  expect(login).toContain('v-if="!restrictedSuperAdminRecovery" class="profile-quick-links"')
  expect(login).toContain('restrictedSuperAdminRecovery')
 })
 it('site Admin usa senha, MFA e autorizacao da API',()=>{
  expect(admin).toContain("storageKey: 'farol-admin-web-dev-v1'")
  expect(admin).toContain('signInWithPassword(')
  expect(admin).toContain('challengeAndVerify(')
  expect(admin).toContain('getAuthenticatorAssuranceLevel()')
  expect(admin).toContain("'/api/v1/admin/access'")
  expect(admin).not.toContain('signUp(')
 })
 it('funcionalidades comuns continuam separadas',()=>{
  expect(gifts).toContain('@click="closeChooser"')
  expect(routes).toContain("meta: { title: 'Presentes', requiresAdmin: true }")
 })
})
