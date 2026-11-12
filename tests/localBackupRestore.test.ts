import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { buildLocalFinancialBackup } from '../src/application/use-cases/exportFinancialBackup'
import { encryptFinancialBackup, decryptVerifiedFinancialBackup } from '../src/infrastructure/backup/encryptedFinancialBackup'
import { restoreLocalFinancialBackup, validateRestorableFinancialBackup, mayRestoreIntoCurrentBrowser } from '../src/infrastructure/backup/restoreLocalFinancialBackup'
import { BrowserWorkspaceRepository } from '../src/infrastructure/persistence/BrowserWorkspaceRepository'
import { BrowserBillRepository } from '../src/infrastructure/persistence/BrowserBillRepository'
import { BrowserFixedExpenseRepository } from '../src/infrastructure/persistence/BrowserFixedExpenseRepository'
import { BrowserTransactionRepository, transactionStorageKey } from '../src/infrastructure/persistence/BrowserTransactionRepository'
import { BrowserBudgetRepository } from '../src/infrastructure/persistence/BrowserBudgetRepository'
import { setVerifiedLocalUser, claimLegacyData } from '../src/infrastructure/persistence/legacyAccess'

const owner='11111111-1111-4111-8111-111111111111'
const another='22222222-2222-4222-8222-222222222222'
const passphrase='senha grande do backup 2026'
const store=new Map<string,string>()
let failWrite:string|null=null
beforeEach(()=>{
  store.clear()
  failWrite=null
  vi.stubGlobal('crypto',webcrypto)
  vi.stubGlobal('localStorage',{
    getItem:(key:string)=>store.get(key)??null,
    setItem:(key:string,value:string)=>{
      if(key===failWrite){failWrite=null;throw Error('quota')}
      store.set(key,value)
    },
    removeItem:(key:string)=>store.delete(key),
  })
  setVerifiedLocalUser(owner)
  claimLegacyData(owner)
})

function sourceSnapshot() {
  const spaces=new BrowserWorkspaceRepository()
  const other=spaces.create('Férias da família')
  spaces.select(other.id)
  new BrowserBillRepository(other.id).saveBill({id:'luz',name:'Energia',dueDay:10,active:true,createdAt:'2026-11-12'})
  new BrowserFixedExpenseRepository(other.id).save({
    id:'fixed1',name:'Internet',amountCents:9000,dueDay:12,
    startMonth:'2026-11',endBeforeMonth:null,createdAt:'2026-11-12T00:00:00Z',paidMonths:[],
  })
  new BrowserTransactionRepository(other.id).save({
    id:'tx1',description:'Mercado',amountCents:15000,category:'Mercado',kind:'expense',
    occurredOn:'2026-11-12',createdAt:'2026-11-12T00:00:00Z',
  })
  new BrowserBudgetRepository(other.id).save({projects:[{
    id:'budget1',title:'Viagem',category:'Lazer',targetCents:100000,
    status:'planning',notes:'',createdAt:'2026-11-12T00:00:00Z',
  }],items:[],quotes:[]})
  return buildLocalFinancialBackup()
}

function resetToEmptyBrowser() {
  const ownerMarker=store.get('farol-financas:legacy-local-owner:v1')
  store.clear()
  if(ownerMarker) store.set('farol-financas:legacy-local-owner:v1',ownerMarker)
}
describe('Restaurar backup criptografado em navegador vazio',()=>{
  it('descriptografa e restaura os registros, preservando o vínculo da conta',async()=>{
    const snapshot=sourceSnapshot()
    const encrypted=await encryptFinancialBackup(snapshot,passphrase,owner)
    resetToEmptyBrowser()
    const originalMarker=store.get('farol-financas:legacy-local-owner:v1')
    const verified=await decryptVerifiedFinancialBackup(encrypted,passphrase,owner)
    expect(mayRestoreIntoCurrentBrowser(owner)).toBe(true)
    const result=restoreLocalFinancialBackup(verified,owner)
    expect(result.spaces).toBe(2)
    expect(result.transactions).toBe(1)
    expect(buildLocalFinancialBackup().workspaces).toEqual(snapshot.workspaces)
    expect(store.get('farol-financas:legacy-local-owner:v1')).toBe(originalMarker)
  })
  it('bloqueia a restauração se já existirem registros, sem tocar em nada',()=>{
    const source=sourceSnapshot()
    const before=new Map(store)
    expect(mayRestoreIntoCurrentBrowser(owner)).toBe(false)
    expect(()=>restoreLocalFinancialBackup(source,owner)).toThrow(/já contém registros/)
    expect(store).toEqual(before)
  })
  it('recusa backup de outra conta mesmo com senha correta, sem gravar',async()=>{
    const encrypted=await encryptFinancialBackup(sourceSnapshot(),passphrase,owner)
    resetToEmptyBrowser()
    const before=new Map(store)
    await expect(decryptVerifiedFinancialBackup(encrypted,passphrase,another)).rejects.toThrow(/incompatível/)
    expect(store).toEqual(before)
  })
  it('em falha de escrita restaura chaves antigas e não altera outros dados',()=>{
    const snapshot=sourceSnapshot()
    resetToEmptyBrowser()
    store.set('pref-usuario','não tocar')
    const before=new Map(store)
    failWrite=transactionStorageKey(snapshot.workspaces[1].workspace.id)
    expect(()=>restoreLocalFinancialBackup(snapshot,owner)).toThrow(/voltou ao estado anterior/)
    expect(store).toEqual(before)
  })
  it('não sobrescreve chaves órfãs de espaço que não aparece mais na lista',()=>{
    const snapshot=sourceSnapshot()
    resetToEmptyBrowser()
    store.set(transactionStorageKey(snapshot.workspaces[1].workspace.id),'informação antiga')
    const before=new Map(store)
    expect(()=>restoreLocalFinancialBackup(snapshot,owner)).toThrow(/nenhum dado foi restaurado/)
    expect(store).toEqual(before)
  })
  it('recusa sessão não verificada ou conta diferente sem escrever',()=>{
    const snapshot=sourceSnapshot()
    resetToEmptyBrowser()
    const before=new Map(store)
    setVerifiedLocalUser(null)
    expect(()=>restoreLocalFinancialBackup(snapshot,owner)).toThrow(/não está autorizada/)
    setVerifiedLocalUser(owner)
    expect(()=>restoreLocalFinancialBackup(snapshot,another)).toThrow(/não está autorizada/)
    expect(store).toEqual(before)
  })
  it('rejeita referências inconsistentes e lançamentos inválidos antes de escrever',()=>{
    const snapshot=sourceSnapshot()
    resetToEmptyBrowser()
    const bad=structuredClone(snapshot)
    bad.workspaces[1].transactions[0].amountCents=-50
    expect(()=>validateRestorableFinancialBackup(bad)).toThrow(/lançamentos inválidos/)
    const badRef=structuredClone(snapshot)
    badRef.workspaces[1].budgets.items.push({id:'item1',projectId:'notfound',title:'teste',
      plannedCents:null,createdAt:'2026-11-12T00:00:00Z'})
    expect(()=>restoreLocalFinancialBackup(badRef,owner)).toThrow(/itens de orçamento inválidos/)
    expect(buildLocalFinancialBackup().workspaces).toHaveLength(1)
  })
})
