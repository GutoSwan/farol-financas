import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const read = (file: string) => readFileSync(new URL('../'+file, import.meta.url), 'utf8')
const admin=read('admin-web/src/App.vue')
const css=read('admin-web/src/style.css')
const normalRoutes=read('src/router/index.ts')
const normalConfig=JSON.parse(read('vercel.json'))
const adminConfig=JSON.parse(read('admin-web/vercel.json'))
const adminPkg=JSON.parse(read('admin-web/package.json'))
const proxy=read('admin-web/api/v1/[...path].js')

describe('Identidade e deploy independentes do Farol Admin',()=>{
 it('web app separado sem URL de administração no Farol normal',()=>{
  expect(adminPkg.name).toBe('farol-admin-web')
  expect(adminConfig.rewrites.some((x:{source:string})=>x.source==='/admin/:path*')).toBe(true)
  expect(normalConfig.rewrites.some((x:{source:string})=>x.source.includes('administracao'))).toBe(false)
  expect(normalRoutes).not.toContain('component: AdminLayout')
    expect(read('src/router/documentTitle.ts')).not.toContain('SUPER ADMIN')
 })
 it('identidade visual exclusiva no login e em todas as telas',()=>{
  for(const p of ['/admin/login','/admin','/admin/backup','/admin/nuvem','/admin/seguranca'])expect(admin).toContain(p)
  expect(css).toContain('.auth-grid')
  expect(css).toContain('.app-shell')
  expect(css).toContain('.sidebar')
  expect(css).toContain('.panel')
  expect(css).toContain('#51ebc8')
 })
 it('so libera sessao Super Admin verificada',()=>{
  expect(admin).toContain("farol_role !== 'super_admin'")
  expect(admin).toContain("aal.currentLevel !== 'aal2'")
  expect(admin).toContain('serverAuthorizes()')
  expect(admin).toContain("gate = ref('checking')")
  expect(admin).not.toContain('signUp(')
  expect(admin).not.toContain('localStorage')
 })
 it('proxy falha fechado e so autoriza acesso tecnico de leitura',()=>{
  expect(proxy).toContain("process.env.VERCEL_ENV!=='preview'")
  expect(proxy).toContain("target.pathname==='/api/v1/admin/access'")
  expect(proxy).toContain("req.method!=='GET'")
  expect(proxy).toContain("'x-vercel-trusted-oidc-idp-token':oidc")
  expect(proxy).not.toContain('VERCEL_AUTOMATION_BYPASS_SECRET')
 })
})
