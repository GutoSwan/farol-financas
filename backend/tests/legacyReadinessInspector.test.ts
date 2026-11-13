import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { PrismaLegacyReadinessInspector } from '../src/infrastructure/repositories/PrismaLegacyReadinessInspector.js'
import { LegacyReadinessForbiddenError } from '../src/application/use-cases/LegacyReadinessInspector.js'
const alice='11111111-1111-4111-8111-111111111111'
const ws='33333333-3333-4333-8333-333333333333'
const defaults=[0,0,0,0,0,0,0,0,0]
function setup(role:'OWNER'|'EDITOR'|null='OWNER',values:number[]=defaults){
  const delegate=(count:number,expected:unknown)=>({
    count:vi.fn(async (args:{where:unknown})=>{
      expect(args.where).toEqual(expected)
      return count
    }),
  })
  const t={
    workspaceMember:{findUnique:vi.fn(async ({where}:{where:unknown})=>{
      expect(where).toEqual({userId_workspaceId:{userId:alice,workspaceId:ws}})
      return role?{role}:null
    })},
    transaction:delegate(values[0],{workspaceId:ws}),
    recurringBill:delegate(values[1],{workspaceId:ws}),
    monthlyBillEntry:delegate(values[2],{bill:{workspaceId:ws}}),
    fixedExpense:delegate(values[3],{workspaceId:ws}),
    fixedExpensePayment:delegate(values[4],{fixedExpense:{workspaceId:ws}}),
    budgetProject:delegate(values[5],{workspaceId:ws}),
    budgetItem:delegate(values[6],{project:{workspaceId:ws}}),
    budgetQuote:delegate(values[7],{item:{project:{workspaceId:ws}}}),
    legacyImportMapping:delegate(values[8],{workspaceId:ws}),
  }
  const transaction=vi.fn(async<T>(work:(tx:typeof t)=>Promise<T>,opts:unknown)=>{
    expect(opts).toEqual({isolationLevel:'RepeatableRead'})
    return work(t)
  })
  const prisma={$transaction:transaction} as unknown as PrismaClient
  return {service:new PrismaLegacyReadinessInspector(prisma),t,transaction}
}
describe('Inventário Prisma exato em transação de leitura',()=>{
  it('consulta 9 tabelas (inclusive filhos) no mesmo snapshot',async()=>{
    const {service,t,transaction}=setup('OWNER',[51,2,8,3,4,1,5,6,0])
    const r=await service.inspect(alice,ws)
    expect(r).toEqual({workspaceId:ws,exact:true,state:'occupied',counts:{
      transactions:51,recurringBills:2,monthlyEntries:8,fixedExpenses:3,
      fixedPayments:4,budgetProjects:1,budgetItems:5,budgetQuotes:6,legacyMappings:0,
    }})
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(t.budgetQuote.count).toHaveBeenCalledTimes(1)
  })
  it('registros filhos isolados impedem declarar espaço vazio',async()=>{
    const {service}=setup('OWNER',[0,0,1,0,0,0,0,0,0])
    expect((await service.inspect(alice,ws)).state).toBe('occupied')
  })
  it('mapeamentos anteriores exigem reconciliação',async()=>{
    const {service}=setup('OWNER',[0,0,0,0,0,0,0,0,2])
    expect((await service.inspect(alice,ws)).state).toBe('mapped')
  })
  it('sem OWNER nega antes de consultar qualquer tabela financeira',async()=>{
    for(const role of ['EDITOR',null] as const){
      const {service,t}=setup(role)
      await expect(service.inspect(alice,ws)).rejects.toBeInstanceOf(LegacyReadinessForbiddenError)
      expect(t.transaction.count).not.toHaveBeenCalled()
      expect(t.legacyImportMapping.count).not.toHaveBeenCalled()
    }
  })
  it('rejeita contagem inválida em vez de tratá-la como ausência',async()=>{
    const {service}=setup('OWNER',[0,0,NaN,0,0,0,0,0,0])
    await expect(service.inspect(alice,ws)).rejects.toThrow('inválido')
  })
})
