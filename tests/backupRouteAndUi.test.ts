import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const router=readFileSync(new URL('../src/router/index.ts',import.meta.url),'utf8')
const layout=readFileSync(new URL('../src/presentation/layouts/AppLayout.vue',import.meta.url),'utf8')
const profile=readFileSync(new URL('../src/presentation/pages/AuthPage.vue',import.meta.url),'utf8')
const backup=readFileSync(new URL('../src/presentation/pages/LegacyBackupPage.vue',import.meta.url),'utf8')
const manifest=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'))
describe('Rota e interface de restauração de backup',()=>{
  it('rota disponível apenas dentro do layout financeiro com guard de vínculo',()=>{
    expect(router).toContain('import LegacyBackupPage')
    expect(router).toContain("path: 'backup-financeiro', component: LegacyBackupPage")
    expect(router).toContain("requiresLegacyData: true")
    expect(router).toContain("if (to.meta.requiresLegacyData && access !== 'allowed')")
  })
  it('menu do perfil tem acesso ao backup e a Vercel atende acesso direto',()=>{
    expect(layout).toContain('to="/backup-financeiro"')
    expect(profile).toContain('to="/backup-financeiro"')
    expect(manifest.rewrites).toContainEqual({source:'/backup-financeiro',destination:'/index.html'})
  })
  it('a restauração requer arquivo conferido, senha e palavra de confirmação',()=>{
    expect(backup).toContain("await decryptVerifiedFinancialBackup(raw, restorationPassword.value, owner)")
    expect(backup).toContain("restorationConsent.value !== 'RESTAURAR'")
    expect(backup).toContain("await confirmedOwner()")
    expect(backup).toContain('mayRestoreIntoCurrentBrowser(owner)')
    expect(backup).toContain('restoreLocalFinancialBackup(snapshot, owner)')
    expect(backup).not.toContain('@click="window.location.reload()"')
  })
})
