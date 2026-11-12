import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const page=readFileSync(new URL('../src/presentation/pages/LegacyBackupPage.vue',import.meta.url),'utf8')
describe('Prévia de identidades legadas no Farol financeiro',()=>{
  it('exige backup verificado, identidade AAL2 e fingerprint antes e depois',()=>{
    const action=page.slice(page.indexOf('async function generateIdentityPlan()'),page.indexOf('async function simulateMigration()'))
    expect(action).toContain('!inspected.value')
    expect(action).toContain('!inspectedFingerprint.value')
    expect(action).toContain('const owner = await confirmedOwner()')
    expect(action).toContain('await fingerprintFinancialBackup(snapshot)')
    expect(action).toContain('await planLegacyIdentifiers(snapshot, owner)')
    expect(action).toContain('await confirmedOwner() !== owner')
    expect(action).toContain('identityPlan.value = plan')
    expect(action).not.toContain('fetch(')
    expect(action).not.toContain('localStorage.setItem')
  })
  it('limpa qualquer plano ao selecionar novo backup ou alterar inventário',()=>{
    const fn=page.slice(page.indexOf('function clearInspectedBackup()'),page.indexOf('function disposeDownload()'))
    expect(fn).toContain('identityPlan.value = null')
    expect(page).toContain('Gerar prévia das identidades locais')
    expect(page).toContain('Nenhuma correspondência foi cadastrada no banco')
    expect(page).toContain('identityPlan.requiresPaymentDateReview')
  })
})
