import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { canAccessWithoutSession } from '../src/router/authNavigation'
import { safeAuthRedirect } from '../src/domain/auth/authRedirect'

const routing=readFileSync(new URL('../src/router/index.ts',import.meta.url),'utf8')
const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'))
const page=readFileSync(new URL('../src/presentation/pages/AuthPage.vue',import.meta.url),'utf8')
const auth=readFileSync(new URL('../src/presentation/composables/useAuth.ts',import.meta.url),'utf8')
const origin='https://farol-financas-git-feat-v029-admin-standalone-preview-farol13.vercel.app'

describe('Link de e-mail na Preview v0.29',()=>{
 it('aponta confirmação e recuperação ao domínio estável sem depender da v0.27',()=>{
  expect(safeAuthRedirect('/confirmar-email','https://random.vercel.app',origin,true))
    .toBe(origin+'/confirmar-email')
  expect(safeAuthRedirect('/redefinir-senha','https://random.vercel.app',origin,true))
    .toBe(origin+'/redefinir-senha')
  expect(auth).toContain("emailRedirect('/confirmar-email')")
  expect(auth).toContain("emailRedirect('/redefinir-senha')")
  expect(auth).not.toContain('security-v027-auth-only-admin')
 })
 it('possui rotas públicas e rewrites para abrir links em outra aba',()=>{
  expect(canAccessWithoutSession('/confirmar-email')).toBe(true)
  expect(canAccessWithoutSession('/redefinir-senha')).toBe(true)
  expect(routing).toContain("{ path: '/confirmar-email', component: AuthPage, props: { mode: 'confirmed' }")
  expect(vercel.rewrites).toContainEqual({source:'/confirmar-email',destination:'/index.html'})
 })
 it('não declara confirmação só porque a URL possui parâmetros',()=>{
  expect(page).toContain('await supabase.auth.getUser()')
  expect(page).toContain('data.user?.email_confirmed_at')
  expect(page).toContain("confirmationStatus.value = 'unverified'")
  expect(page).toContain('v-if="signupCodeVisible"')
 })
})