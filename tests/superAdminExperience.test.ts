import { describe, expect, it } from 'vitest'
import { isFarolAdmin, isFarolSuperAdmin } from '../src/domain/auth/adminAccess'
import { readFileSync } from 'node:fs'
const read = (file: string) => readFileSync(new URL('../'+file, import.meta.url), 'utf8')
const routes=read('src/router/index.ts')
const layout=read('src/presentation/layouts/AppLayout.vue')
const login=read('src/presentation/pages/AuthPage.vue')
const gifts=read('src/presentation/pages/GiftsPage.vue')
const admin=read('admin-web/src/App.vue')

describe('Super Admin separado do Farol financeiro',()=>{
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
  expect(routes).toContain("signOut({ scope: 'local' })")
  expect(login).toContain('isFarolSuperAdmin(identity.user)')
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
