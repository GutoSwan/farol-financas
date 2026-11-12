import {describe,expect,it} from 'vitest'
import {compareLocalAndCloud,inventory} from '../src/domain/services/cloudSyncPreflight'
import type {FinancialBackup} from '../src/infrastructure/backup/encryptedFinancialBackup'
import type {OnlineWorkspace} from '../src/infrastructure/api/onlineWorkspaces'
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222'
const local:FinancialBackup={format:'farol-financas-local-backup',version:1,exportedAt:'2026-11-12',activeWorkspaceId:'household-default',
  workspaces:[{workspace:{id:'household-default',name:'Casa',createdAt:'2026-11-12'},bills:[],monthlyEntries:[],fixedExpenses:[],transactions:[],budgets:{projects:[],items:[],quotes:[]}}]}
const remote=(id:string,role:OnlineWorkspace['role']='OWNER'):OnlineWorkspace=>({id,name:'casa',role})
const counts={transactions:0,'recurring-bills':0,'fixed-expenses':0,budgets:0}
describe('prévia da sincronização segura',()=>{
  it('compara espaços sem permitir gravação mesmo com quatro módulos vazios',()=>{
    const x=compareLocalAndCloud(local,[remote(a)],[{workspaceId:a,counts}])
    expect(x.entries[0].status).toBe('empty');expect(x.canImport).toBe(false)
    expect(inventory(local.workspaces[0])).toEqual(counts)
  })
  it('não cria mapeamento por nome ausente, duplicado nem papel VIEWER',()=>{
    expect(compareLocalAndCloud(local,[],[]).entries[0].status).toBe('missing')
    expect(compareLocalAndCloud(local,[remote(a),remote(b)],[]).entries[0].status).toBe('ambiguous')
    expect(compareLocalAndCloud(local,[remote(a,'VIEWER')],[]).entries[0].status).toBe('not-owner')
  })
  it('nuvem já ocupada bloqueia migração ingênua',()=>{
    expect(compareLocalAndCloud(local,[remote(a)],[{workspaceId:a,counts:{...counts,transactions:2}}]).entries[0].status).toBe('occupied')
  })
  it('página de 50 nunca é declarada completa',()=>{
    expect(compareLocalAndCloud(local,[remote(a)],[{workspaceId:a,counts:{...counts,budgets:50}}]).entries[0].status).toBe('truncated')
  })
  it('dados retornados repetidos são recusados',()=>{
    expect(()=>compareLocalAndCloud(local,[remote(a)],[{workspaceId:a,counts},{workspaceId:a,counts}])).toThrow('repetidos')
  })
})
