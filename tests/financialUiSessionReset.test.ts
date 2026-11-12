import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { invalidateFinancialUiSession, subscribeFinancialUiReset } from '../src/presentation/composables/financialUiSession'
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
describe('Privacidade do cache financeiro durante logout e troca de conta',()=>{
  it('notifica todas as telas, mesmo que uma falhe',()=>{
    const called:string[]=[]
    const a=subscribeFinancialUiReset(()=>{called.push('before');throw Error('bad screen')})
    const b=subscribeFinancialUiReset(()=>called.push('after'))
    invalidateFinancialUiSession()
    expect(called).toEqual(['before','after'])
    a();b()
  })
  it('limpa refs de cada módulo antes de permitir outra identidade',()=>{
    for(const path of [
      'src/presentation/composables/useWorkspaces.ts',
      'src/presentation/composables/useTransactions.ts',
      'src/presentation/composables/useBills.ts',
      'src/presentation/composables/useBudgets.ts',
      'src/presentation/composables/useFixedExpenses.ts',
    ]){
      const source=read(path)
      expect(source).toContain('subscribeFinancialUiReset(')
      expect(source).toContain('isLegacyOwnerSession()')
    }
    expect(read('src/presentation/composables/useAuth.ts')).toContain('invalidateFinancialUiSession()')
    expect(read('src/App.vue')).toContain('invalidateFinancialUiSession()')
  })
  it('não carrega lançamentos e orçamentos até a sessão antiga estar vinculada',()=>{
    const tx=read('src/presentation/composables/useTransactions.ts')
    const budgets=read('src/presentation/composables/useBudgets.ts')
    expect(tx).toContain("if (!isLegacyOwnerSession()) { error.value = ''; return }")
    expect(budgets).toContain("if (!isLegacyOwnerSession()) { error.value = ''; return }")
    expect(tx).toContain('export function useTransactions() {\n  reload()')
    expect(budgets).toContain('export function useBudgets() {\n  reload()')
  })
  it('login normal descarta estado anterior de recuperação por e-mail',()=>{
    const auth=read('src/presentation/composables/useAuth.ts')
    const fn=auth.slice(auth.indexOf('async function signIn('),auth.indexOf('async function signUp('))
    expect(fn).toContain('recoveringPassword.value = false')
    expect(fn).toContain('recoveryMfaVerified.value = false')
  })
})
