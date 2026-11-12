import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserWorkspaceRepository } from '../src/infrastructure/persistence/BrowserWorkspaceRepository'
import { BrowserBillRepository, billsStorageKey } from '../src/infrastructure/persistence/BrowserBillRepository'
import { BrowserTransactionRepository, transactionStorageKey } from '../src/infrastructure/persistence/BrowserTransactionRepository'
import { BrowserFixedExpenseRepository } from '../src/infrastructure/persistence/BrowserFixedExpenseRepository'
import { BrowserBudgetRepository, budgetStorageKey } from '../src/infrastructure/persistence/BrowserBudgetRepository'

const store = new Map<string,string>()
let failSet: string | null = null
let failRemove: string | null = null
let failRead: string | null = null
beforeEach(() => {
  store.clear()
  failSet = failRemove = failRead = null
  vi.stubGlobal('localStorage',{
    getItem: (key:string) => {
      if(key===failRead) throw new Error('storage is disabled')
      return store.get(key) ?? null
    },
    setItem: (key:string,value:string) => {
      if(key===failSet) { failSet=null; throw new Error('write failed') }
      store.set(key,value)
    },
    removeItem: (key:string) => {
      if(key===failRemove) { failRemove=null; throw new Error('remove failed') }
      store.delete(key)
    },
  })
})
function setup() {
  const spaces=new BrowserWorkspaceRepository()
  const friend=spaces.create('Casa de testes')
  spaces.select(friend.id)
  new BrowserBillRepository(friend.id).saveBill({id:'luz',name:'Luz privada',dueDay:10,active:true,createdAt:'2026-11-12'})
  new BrowserFixedExpenseRepository(friend.id).save({
    id:'fixed1',name:'Internet privada',amountCents:1000,dueDay:10,
    startMonth:'2026-11',endBeforeMonth:null,createdAt:'2026-11-12T00:00:00Z',paidMonths:[],
  })
  new BrowserTransactionRepository(friend.id).save({
    id:'tx1',description:'Mercado privado',amountCents:1000,
    category:'Mercado',kind:'expense',occurredOn:'2026-11-12',createdAt:'2026-11-12T00:00:00Z',
  })
  store.set(budgetStorageKey(friend.id),JSON.stringify({projects:[{id:'budget1'}],items:[],quotes:[]}))
  return {spaces,friend}
}
describe('Exclusão de espaço: segurança contra falhas parciais de armazenamento',()=>{
  it('restaura todas as chaves se falhar a exclusão de um módulo intermediário',()=>{
    const {spaces,friend}=setup()
    const before=new Map(store)
    failRemove=transactionStorageKey(friend.id)
    expect(()=>spaces.delete(friend.id)).toThrow(/registros anteriores foram restaurados/)
    expect(store).toEqual(before)
    expect(spaces.getActiveId()).toBe(friend.id)
    expect(new BrowserBillRepository(friend.id).listBills()).toHaveLength(1)
    expect(new BrowserFixedExpenseRepository(friend.id).list()).toHaveLength(1)
  })
  it('restaura os dados se falhar o salvamento da lista de espaços',()=>{
    const {spaces,friend}=setup()
    const before=new Map(store)
    failSet='farol-financas:workspaces:v1'
    expect(()=>spaces.delete(friend.id)).toThrow(/registros anteriores foram restaurados/)
    expect(store).toEqual(before)
    expect(spaces.getActiveId()).toBe(friend.id)
    expect(new BrowserTransactionRepository(friend.id).list()).toHaveLength(1)
  })
  it('não remove nada se nem a leitura anterior puder ser concluída',()=>{
    const {spaces,friend}=setup()
    const before=new Map(store)
    failRead=billsStorageKey(friend.id)
    expect(()=>spaces.delete(friend.id)).toThrow(/Nada foi excluído/)
    expect(store).toEqual(before)
  })
  it('remove todos os módulos somente após execução concluída com sucesso',()=>{
    const {spaces,friend}=setup()
    spaces.delete(friend.id)
    expect(spaces.list()).toHaveLength(1)
    expect(new BrowserBillRepository(friend.id).listBills()).toHaveLength(0)
    expect(new BrowserFixedExpenseRepository(friend.id).list()).toHaveLength(0)
    expect(new BrowserTransactionRepository(friend.id).list()).toHaveLength(0)
    expect(new BrowserBudgetRepository(friend.id).read()).toEqual({projects:[],items:[],quotes:[]})
  })
})
