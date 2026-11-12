import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { PrismaLegacyTransactionConnectionService } from '../src/application/use-cases/PrismaLegacyTransactionConnectionService.js'
import { legacyFinancialBatchSchema } from '../src/application/use-cases/legacyFinancialPayload.js'

const owner='11111111-1111-4111-8111-111111111111'
const space='33333333-3333-4333-8333-333333333333'
const when='2026-11-12T12:00:00.000Z'
const full={
  workspace:{id:'household-default',name:'Casa',createdAt:when},
  bills:[{id:'bill-1',name:'Energia',dueDay:10,active:true,createdAt:when}],
  monthlyEntries:[{id:'entry-1',billId:'bill-1',yearMonth:'2026-11',
    amountCents:1550,status:'paid',paidAt:when}],
  fixedExpenses:[{id:'fixed-1',name:'Internet',amountCents:10000,dueDay:12,
    startMonth:'2026-09',endBeforeMonth:null,paidMonths:[],createdAt:when}],
  budgets:{
    projects:[{id:'proj-1',title:'Reforma',category:'Casa',targetCents:500000,
      status:'planning',notes:'',createdAt:when}],
    items:[{id:'item-1',projectId:'proj-1',title:'Pisos',plannedCents:200000,createdAt:when}],
    quotes:[{id:'quote-1',itemId:'item-1',provider:'Loja de testes',amountCents:190000,
      estimatedDays:10,materialsIncluded:true,notes:'',selected:true,createdAt:when}],
  },
  transactions:[{id:'tx-1',description:'Compra dos pisos',category:'Casa',
    amountCents:190000,kind:'expense',occurredOn:'2026-11-12',
    createdAt:when,budgetProjectId:'proj-1',budgetItemId:'item-1'}],
}
type Row=Record<string,any>
const kinds=['recurringBill','monthlyBillEntry','fixedExpense','budgetProject','budgetItem','budgetQuote','transaction'] as const
function fixture(errorOn?:string){
  const records:Record<string,Row[]>={}
  for(const kind of kinds)records[kind]=[]
  const mappings:Row[]=[]
  const delegate=(kind:typeof kinds[number])=>({
    create:async({data}:{data:Row})=>{
      if(errorOn===kind)throw Error('Injected database failure')
      const result={id:randomUUID(),...data}
      records[kind].push(result)
      return {id:result.id}
    },
    findFirst:async({where}:{where:Row})=>{
      return records[kind].find(x=>{
        if(where.id && x.id!==where.id)return false
        if(where.workspaceId && x.workspaceId!==where.workspaceId)return false
        if(where.bill?.workspaceId){
          const parent=records.recurringBill.find(b=>b.id===x.billId)
          return parent?.workspaceId===where.bill.workspaceId
        }
        if(where.project?.workspaceId){
          const parent=records.budgetProject.find(p=>p.id===x.projectId)
          return parent?.workspaceId===where.project.workspaceId
        }
        if(where.item?.project?.workspaceId){
          const item=records.budgetItem.find(i=>i.id===x.itemId)
          const project=records.budgetProject.find(p=>p.id===item?.projectId)
          return project?.workspaceId===where.item.project.workspaceId
        }
        return true
      })??null
    },
  })
  const prisma={
    $transaction:async<T>(cb:(tx:any)=>Promise<T>)=>{
      const beforeRecords=structuredClone(records),beforeMappings=structuredClone(mappings)
      const tx={
        workspaceMember:{findUnique:async({where}:any)=>
          where.userId_workspaceId.userId===owner &&
          where.userId_workspaceId.workspaceId===space?{role:'OWNER'}:null},
        workspace:{findFirst:async({where}:any)=>
          where.id===space?{id:space,name:'Casa'}:null},
        legacyImportMapping:{
          findUnique:async({where}:any)=>mappings.find(m=>m.ownerUserId===
            where.ownerUserId_sourceKey.ownerUserId && m.sourceKey===
            where.ownerUserId_sourceKey.sourceKey)??null,
          create:async({data}:any)=>{
            if(mappings.some(m=>m.ownerUserId===data.ownerUserId && m.sourceKey===data.sourceKey)||
               mappings.some(m=>m.entityType===data.entityType && m.destinationRecordId===data.destinationRecordId)){
              throw Error('P2002: duplicate')
            }
            mappings.push({...data})
            return {id:randomUUID()}
          },
        },
        ...Object.fromEntries(kinds.map(k=>[k,delegate(k)])),
      }
      try {return await cb(tx)}
      catch(e){
        for(const kind of kinds)records[kind]=beforeRecords[kind]
        mappings.splice(0,mappings.length,...beforeMappings)
        throw e
      }
    },
  } as unknown as PrismaClient
  return {service:new PrismaLegacyTransactionConnectionService(prisma),records,mappings}
}
describe('Conexão de contas, históricos e orçamentos na mesma transação',()=>{
  it('cria todos os registros com referências remapeadas e não duplica no replay',async()=>{
    const f=fixture()
    const first=await f.service.connect(owner,space,full)
    expect(first).toMatchObject({created:7,reused:0,total:7,workspaceMapping:'created'})
    expect(f.mappings).toHaveLength(8)
    for(const kind of kinds)expect(f.records[kind]).toHaveLength(1)
    expect(f.records.monthlyBillEntry[0].billId).toBe(f.records.recurringBill[0].id)
    expect(f.records.budgetItem[0].projectId).toBe(f.records.budgetProject[0].id)
    expect(f.records.budgetQuote[0].itemId).toBe(f.records.budgetItem[0].id)
    expect(f.records.transaction[0].budgetProjectId).toBe(f.records.budgetProject[0].id)
    expect(f.records.transaction[0].budgetItemId).toBe(f.records.budgetItem[0].id)
    const second=await f.service.connect(owner,space,full)
    expect(second).toMatchObject({created:0,reused:7,total:7,workspaceMapping:'reused'})
    for(const kind of kinds)expect(f.records[kind]).toHaveLength(1)
    expect(f.mappings).toHaveLength(8)
  })
  it('reverte todo o lote se uma cotação falhar depois de criar contas e projetos',async()=>{
    const f=fixture('budgetQuote')
    await expect(f.service.connect(owner,space,full)).rejects.toThrow('Injected database failure')
    for(const kind of kinds)expect(f.records[kind]).toHaveLength(0)
    expect(f.mappings).toHaveLength(0)
  })
  it('rejeita histórico vinculado a conta inexistente, sem iniciar gravação',async()=>{
    const f=fixture()
    await expect(f.service.connect(owner,space,{...full,bills:[]})).rejects.toThrow('inválido')
    expect(f.mappings).toHaveLength(0)
  })
  it('rejeita duplicações de competência da mesma conta',async()=>{
    const f=fixture()
    await expect(f.service.connect(owner,space,{...full,
      monthlyEntries:[full.monthlyEntries[0],{...full.monthlyEntries[0],id:'entry-2'}]}))
      .rejects.toThrow('inválido')
    expect(f.mappings).toHaveLength(0)
  })
  it('recusa pagamentos fixos com meses pagos sem data real',async()=>{
    const f=fixture()
    await expect(f.service.connect(owner,space,{...full,
      fixedExpenses:[{...full.fixedExpenses[0],paidMonths:['2026-10']}]}))
      .rejects.toThrow('inválido')
    expect(f.mappings).toHaveLength(0)
  })
  it('recusa item de orçamento sem projeto e cotação sem item',async()=>{
    const f=fixture()
    await expect(f.service.connect(owner,space,{...full,budgets:{...full.budgets,projects:[]}}))
      .rejects.toThrow('inválido')
    await expect(f.service.connect(owner,space,{...full,budgets:{...full.budgets,items:[]}}))
      .rejects.toThrow('inválido')
    expect(f.mappings).toHaveLength(0)
  })
  it('não permite trocar valores de um registro já importado',async()=>{
    const f=fixture()
    await f.service.connect(owner,space,full)
    const before=structuredClone(f.records)
    const altered={...full,monthlyEntries:[{...full.monthlyEntries[0],amountCents:1600}]}
    await expect(f.service.connect(owner,space,altered)).rejects.toThrow('Conflito')
    expect(f.records).toEqual(before)
  })
  it('impede vincular lançamento a item que não pertence ao projeto declarado',async()=>{
    const f=fixture()
    const invalid={...full,transactions:[{...full.transactions[0],budgetProjectId:'outro-projeto'}]}
    await expect(f.service.connect(owner,space,invalid)).rejects.toThrow('inválido')
  })
  it('preserva o texto original exatamente para não alterar a impressão digital SHA-256',()=>{
    const raw=structuredClone(full)
    raw.bills[0].name='  Energia  '
    raw.budgets.projects[0].title='  Reforma  '
    raw.workspace.name='  Casa  '
    const verified=legacyFinancialBatchSchema.parse(raw)
    expect(verified.bills[0].name).toBe('  Energia  ')
    expect(verified.budgets.projects[0].title).toBe('  Reforma  ')
    expect(verified.workspace.name).toBe('  Casa  ')
  })
})
