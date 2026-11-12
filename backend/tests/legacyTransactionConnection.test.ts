import { describe, expect, it } from 'vitest'
import { randomUUID, createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { PrismaLegacyTransactionConnectionService, legacyHash } from '../src/application/use-cases/PrismaLegacyTransactionConnectionService.js'
import { LegacyMappingConflictError } from '../src/infrastructure/repositories/PrismaLegacyImportMappingService.js'

const alice='11111111-1111-4111-8111-111111111111'
const bob='22222222-2222-4222-8222-222222222222'
const space='33333333-3333-4333-8333-333333333333'
const local={
  workspace:{id:'local-abc',name:'Casa',createdAt:'2026-11-12T15:00:00.000Z'},
  transactions:[{
    id:'tx-1',description:'Mercado',category:'Mercado',amountCents:1590,
    kind:'expense',occurredOn:'2026-11-11',createdAt:'2026-11-11T12:00:00.000Z',
  },{
    id:'tx-2',description:'Salário',category:'Trabalho',amountCents:12300,
    kind:'income',occurredOn:'2026-11-10',createdAt:'2026-11-10T08:00:00.000Z',
  }],
}
type Row={ownerUserId:string;workspaceId:string;entityType:string;sourceWorkspaceKey:string;sourceKey:string;contentFingerprint:string;destinationRecordId:string}
type Tx={id:string;workspaceId:string;description:string;category:string;amountCents:number;kind:string;occurredOn:Date;createdAt:Date}
function dbFixture(options:{role?:'OWNER'|'EDITOR'|null;occupied?:boolean;failAfter?:number;spaceName?:string}={}) {
  const mappings:Row[]=[]
  const transactions:Tx[]=options.occupied?[{
    id:randomUUID(),workspaceId:space,description:'Já existe',category:'Teste',amountCents:500,kind:'EXPENSE',
    occurredOn:new Date('2026-11-01'),createdAt:new Date('2026-11-01'),
  }]:[]
  let insertions=0
  const prisma={
    $transaction:async<T>(fn:(tx:unknown)=>Promise<T>)=>{
      const beforeMaps=structuredClone(mappings),beforeTx=structuredClone(transactions),beforeCount=insertions
      const tx={
        workspaceMember:{findUnique:async({where}:{where:{userId_workspaceId:{userId:string;workspaceId:string}}})=>
          where.userId_workspaceId.userId===alice && where.userId_workspaceId.workspaceId===space &&
          options.role!==null ? {role:options.role??'OWNER'} : null},
        workspace:{findFirst:async({where}:{where:{id:string}})=>where.id===space?{id:space,name:options.spaceName??'Casa'}:null},
        recurringBill:{findFirst:async()=>null},
        fixedExpense:{findFirst:async()=>null},
        budgetProject:{findFirst:async()=>null},
        transaction:{
          findFirst:async({where}:{where:{workspaceId:string;id?:string}})=>
            transactions.find(t=>t.workspaceId===where.workspaceId&&(!where.id||where.id===t.id))??null,
          create:async({data}:{data:Omit<Tx,'id'>})=>{
            insertions++
            if(options.failAfter && insertions===options.failAfter)throw new Error('fail-create')
            const item={id:randomUUID(),...data}
            transactions.push(item)
            return {id:item.id}
          },
        },
        legacyImportMapping:{
          findUnique:async({where}:{where:{ownerUserId_sourceKey:{ownerUserId:string;sourceKey:string}}})=>
            mappings.find(m=>m.ownerUserId===where.ownerUserId_sourceKey.ownerUserId &&
              m.sourceKey===where.ownerUserId_sourceKey.sourceKey)??null,
          create:async({data}:{data:Row})=>{
            if(mappings.some(m=>m.ownerUserId===data.ownerUserId&&m.sourceKey===data.sourceKey)||
                mappings.some(m=>m.entityType===data.entityType&&m.destinationRecordId===data.destinationRecordId)) {
              throw new Error('P2002')
            }
            mappings.push({...data})
          },
        },
      }
      try {return await fn(tx)} catch(e) {
        mappings.splice(0,mappings.length,...beforeMaps)
        transactions.splice(0,transactions.length,...beforeTx)
        insertions=beforeCount
        throw e
      }
    },
  } as unknown as PrismaClient
  return {
    service:new PrismaLegacyTransactionConnectionService(prisma),mappings,transactions,
    get insertions(){return insertions},
  }
}

describe('Conectar lançamentos com banco e correspondência em transação única',()=>{
  it('conecta espaço, cria lançamentos e reconhece reenvio sem duplicar',async()=>{
    const f=dbFixture()
    const first=await f.service.connect(alice,space,local)
    expect(first).toEqual({status:'completed',workspaceMapping:'created',created:2,reused:0,total:2})
    expect(f.mappings).toHaveLength(3)
    expect(f.transactions).toHaveLength(2)
    const second=await f.service.connect(alice,space,local)
    expect(second).toEqual({status:'completed',workspaceMapping:'reused',created:0,reused:2,total:2})
    expect(f.mappings).toHaveLength(3)
    expect(f.transactions).toHaveLength(2)
    expect(f.insertions).toBe(2)
    expect(f.transactions.map(x=>x.kind)).toEqual(['EXPENSE','INCOME'])
  })
  it('hash do servidor é igual ao cálculo SHA256/JSON do manifesto do frontend',()=>{
    const array=['farol:legacy:source-key:v1',alice,local.workspace.id,'transaction','tx-1']
    expect(legacyHash(array)).toBe(createHash('sha256').update(JSON.stringify(array)).digest('hex'))
    expect(legacyHash(array)).toHaveLength(64)
  })
  it('mesmo ID e valor alterado causa conflito sem modificar lançamentos existentes',async()=>{
    const f=dbFixture()
    await f.service.connect(alice,space,local)
    const before=structuredClone(f.transactions)
    const modified=structuredClone(local)
    modified.transactions[0].amountCents=2000
    await expect(f.service.connect(alice,space,modified)).rejects.toBeInstanceOf(LegacyMappingConflictError)
    expect(f.transactions).toEqual(before)
    expect(f.mappings).toHaveLength(3)
  })
  it('falha do segundo lançamento desfaz o primeiro e a associação de espaço',async()=>{
    const f=dbFixture({failAfter:2})
    await expect(f.service.connect(alice,space,local)).rejects.toThrow('fail-create')
    expect(f.transactions).toHaveLength(0)
    expect(f.mappings).toHaveLength(0)
  })
  it('não conecta registros à nuvem já ocupada, mesmo que o nome coincida',async()=>{
    const f=dbFixture({occupied:true})
    const before=structuredClone(f.transactions)
    await expect(f.service.connect(alice,space,local)).rejects.toThrow('já contém registros')
    expect(f.transactions).toEqual(before)
    expect(f.mappings).toHaveLength(0)
  })
  it('recusa conta diferente, papel EDITOR e nome de espaço não confirmado',async()=>{
    const f=dbFixture()
    await expect(f.service.connect(bob,space,local)).rejects.toThrow('indisponível')
    const editor=dbFixture({role:'EDITOR'})
    await expect(editor.service.connect(alice,space,local)).rejects.toThrow('indisponível')
    const mismatch=dbFixture({spaceName:'Outra pessoa'})
    await expect(mismatch.service.connect(alice,space,local)).rejects.toBeInstanceOf(LegacyMappingConflictError)
    expect(f.mappings).toHaveLength(0)
  })
  it('recusa duplicações e vínculos de orçamento não migrados',async()=>{
    const f=dbFixture()
    const twice=structuredClone(local)
    twice.transactions.push({...twice.transactions[0]})
    await expect(f.service.connect(alice,space,twice)).rejects.toThrow('inválido')
    const linked={...local,transactions:[{...local.transactions[0],budgetProjectId:'budget-1'}]}
    await expect(f.service.connect(alice,space,linked)).rejects.toThrow('inválido')
    expect(f.transactions).toHaveLength(0)
  })
  it('não aceita ownerUserId ou destinationId escolhido pelo navegador',async()=>{
    const f=dbFixture()
    await expect(f.service.connect(alice,space,{...local,ownerUserId:alice})).rejects.toThrow('inválido')
    expect(f.mappings).toHaveLength(0)
  })
})
