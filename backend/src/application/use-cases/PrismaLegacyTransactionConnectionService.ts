import { createHash } from 'node:crypto'
import { legacyFinancialBatchSchema } from './legacyFinancialPayload.js'
import type { PrismaClient } from '@prisma/client'
import { PrismaLegacyImportMappingService, LegacyMappingConflictError } from '../../infrastructure/repositories/PrismaLegacyImportMappingService.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export type TransactionConnectionPayload = import('./legacyFinancialPayload.js').LegacyFinancialBatch
export interface LegacyConnectionResult {
  status: 'completed'
  workspaceMapping: 'created' | 'reused'
  created: number
  reused: number
  total: number
}
export interface LegacyConnectionService {
  connect(ownerUserId: string, targetWorkspaceId: string, input: unknown): Promise<LegacyConnectionResult>
}
export class LegacyConnectionValidationError extends Error {
  constructor() {
    super('Lote inválido ou incompatível com a migração segura de registros financeiros.')
    this.name = 'LegacyConnectionValidationError'
  }
}
export class LegacyConnectionAccessError extends Error {
  constructor() {
    super('Espaço online indisponível para esta conta.')
    this.name = 'LegacyConnectionAccessError'
  }
}
export class LegacyConnectionOccupiedError extends Error {
  constructor() {
    super('Este espaço online já contém registros. A conexão automática foi bloqueada para evitar duplicações.')
    this.name = 'LegacyConnectionOccupiedError'
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== 'object') return value
  const sorted: Record<string, unknown> = {}
  const obj = value as Record<string, unknown>
  for (const key of Object.keys(obj).sort()) sorted[key] = canonical(obj[key])
  return sorted
}
// Compatibilidade byte-a-byte com planLegacyIdentifiers do frontend.
export function legacyHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')
}
function sourceKey(ownerUserId: string, localSpaceId: string, type: string, localId: string): string {
  return legacyHash(['farol:legacy:source-key:v1',ownerUserId,localSpaceId,type,localId])
}
function fingerprint(value: unknown): string {
  return legacyHash(['farol:legacy:record-content:v1',canonical(value)])
}
function sameName(a:string,b:string):boolean {
  return a.trim().normalize('NFC').toLocaleLowerCase('pt-BR') ===
    b.trim().normalize('NFC').toLocaleLowerCase('pt-BR')
}

/**
 * Conecta UMA origem local a um espaço remoto previamente existente.
 * A associação de espaço e TODOS os lançamentos fazem parte da mesma
 * transação PostgreSQL; uma falha não deixa importação parcial.
 *
 * Não mistura com registros remotos preexistentes na PRIMEIRA conexão.
 * Conecta contas, históricos, gastos fixos e orçamentos com referências.
 * Pagamentos fixos antigos sem data continuam BLOQUEADOS.
 * Nenhuma rota chama esta classe sem flag explícita no servidor.
 */
export class PrismaLegacyTransactionConnectionService implements LegacyConnectionService {
  constructor(private readonly prisma: PrismaClient) {}

  async connect(ownerUserId: string, targetWorkspaceId: string, raw: unknown): Promise<LegacyConnectionResult> {
    const parsed = legacyFinancialBatchSchema.safeParse(raw)
    if (!UUID.test(ownerUserId) || !UUID.test(targetWorkspaceId) || !parsed.success) {
      throw new LegacyConnectionValidationError()
    }
    const data = parsed.data
    // Dados com pais ausentes, IDs repetidos ou meses pagos sem data
    // já foram recusados pelo schema antes de abrir transação no banco.
    const legacyMapping = new PrismaLegacyImportMappingService(this.prisma)
    const spaceKey = sourceKey(ownerUserId,data.workspace.id,'workspace',data.workspace.id)
    return this.prisma.$transaction(async tx => {
      // A autorização é feita no banco a cada pedido, não pelo papel do frontend.
      const membership = await tx.workspaceMember.findUnique({
        where:{userId_workspaceId:{userId:ownerUserId,workspaceId:targetWorkspaceId}},
        select:{role:true},
      })
      const targetSpace = await tx.workspace.findFirst({
        where:{id:targetWorkspaceId},select:{id:true,name:true},
      })
      if (membership?.role !== 'OWNER' || !targetSpace) throw new LegacyConnectionAccessError()
      if (!sameName(data.workspace.name,targetSpace.name)) {
        throw new LegacyMappingConflictError()
      }
      const existingRoot = await tx.legacyImportMapping.findUnique({
        where:{ownerUserId_sourceKey:{ownerUserId,sourceKey:spaceKey}},
      })
      if (!existingRoot) {
        // Evita associar uma origem a um espaço remoto já ocupado.
        const populated=await Promise.all([
          tx.transaction.findFirst({where:{workspaceId:targetWorkspaceId},select:{id:true}}),
          tx.recurringBill.findFirst({where:{workspaceId:targetWorkspaceId},select:{id:true}}),
          tx.fixedExpense.findFirst({where:{workspaceId:targetWorkspaceId},select:{id:true}}),
          tx.budgetProject.findFirst({where:{workspaceId:targetWorkspaceId},select:{id:true}}),
        ])
        if(populated.some(Boolean)) throw new LegacyConnectionOccupiedError()
      }
      const root = await legacyMapping.importWithinTransaction(tx,{
        ownerUserId,workspaceId:targetWorkspaceId,entityType:'workspace',
        sourceWorkspaceKey:spaceKey,sourceKey:spaceKey,contentFingerprint:fingerprint(data.workspace),
      },async()=>targetWorkspaceId)
      let created=0
      let reused=0
      const register=(status:'created'|'reused')=>{
        if(status==='created')created++
        else reused++
      }
      const bills=new Map<string,string>()
      for(const bill of data.bills){
        const mapping=await legacyMapping.importWithinTransaction(tx,{
          ownerUserId,workspaceId:targetWorkspaceId,entityType:'bill',
          sourceWorkspaceKey:spaceKey,
          sourceKey:sourceKey(ownerUserId,data.workspace.id,'bill',bill.id),
          contentFingerprint:fingerprint(bill),
        },async()=>{
          const saved=await tx.recurringBill.create({data:{
            workspaceId:targetWorkspaceId,name:bill.name,dueDay:bill.dueDay,
            active:bill.active,createdAt:new Date(bill.createdAt),
          },select:{id:true}})
          return saved.id
        })
        bills.set(bill.id,mapping.destinationRecordId)
        register(mapping.status)
      }
      for(const entry of data.monthlyEntries){
        const billId=bills.get(entry.billId)
        if(!billId)throw new LegacyConnectionValidationError()
        const mapping=await legacyMapping.importWithinTransaction(tx,{
          ownerUserId,workspaceId:targetWorkspaceId,entityType:'monthly-entry',
          sourceWorkspaceKey:spaceKey,
          sourceKey:sourceKey(ownerUserId,data.workspace.id,'monthly-entry',
            JSON.stringify([entry.billId,entry.yearMonth])),
          contentFingerprint:fingerprint(entry),
        },async()=>{
          const saved=await tx.monthlyBillEntry.create({data:{
            billId,yearMonth:entry.yearMonth,amountCents:entry.amountCents,
            status:entry.status==='paid'?'PAID':'PENDING',
            paidAt:entry.paidAt?new Date(entry.paidAt):null,
          },select:{id:true}})
          return saved.id
        })
        register(mapping.status)
      }
      for(const fixed of data.fixedExpenses){
        const mapping=await legacyMapping.importWithinTransaction(tx,{
          ownerUserId,workspaceId:targetWorkspaceId,entityType:'fixed-expense',
          sourceWorkspaceKey:spaceKey,
          sourceKey:sourceKey(ownerUserId,data.workspace.id,'fixed-expense',fixed.id),
          contentFingerprint:fingerprint(fixed),
        },async()=>{
          const saved=await tx.fixedExpense.create({data:{
            workspaceId:targetWorkspaceId,name:fixed.name,amountCents:fixed.amountCents,
            dueDay:fixed.dueDay,startMonth:fixed.startMonth,
            endBeforeMonth:fixed.endBeforeMonth,createdAt:new Date(fixed.createdAt),
          },select:{id:true}})
          return saved.id
        })
        register(mapping.status)
      }
      const statuses={
        planning:'PLANNING',quoting:'QUOTING',approved:'APPROVED',
        'in-progress':'IN_PROGRESS',completed:'COMPLETED',
      } as const
      const projects=new Map<string,string>()
      for(const project of data.budgets.projects){
        const mapping=await legacyMapping.importWithinTransaction(tx,{
          ownerUserId,workspaceId:targetWorkspaceId,entityType:'budget-project',
          sourceWorkspaceKey:spaceKey,
          sourceKey:sourceKey(ownerUserId,data.workspace.id,'budget-project',project.id),
          contentFingerprint:fingerprint(project),
        },async()=>{
          const saved=await tx.budgetProject.create({data:{
            workspaceId:targetWorkspaceId,title:project.title,category:project.category,
            targetCents:project.targetCents,status:statuses[project.status],
            notes:project.notes,createdAt:new Date(project.createdAt),
          },select:{id:true}})
          return saved.id
        })
        projects.set(project.id,mapping.destinationRecordId)
        register(mapping.status)
      }
      const items=new Map<string,string>()
      for(const item of data.budgets.items){
        const projectId=projects.get(item.projectId)
        if(!projectId)throw new LegacyConnectionValidationError()
        const mapping=await legacyMapping.importWithinTransaction(tx,{
          ownerUserId,workspaceId:targetWorkspaceId,entityType:'budget-item',
          sourceWorkspaceKey:spaceKey,
          sourceKey:sourceKey(ownerUserId,data.workspace.id,'budget-item',item.id),
          contentFingerprint:fingerprint(item),
        },async()=>{
          const saved=await tx.budgetItem.create({data:{
            projectId,title:item.title,plannedCents:item.plannedCents,
            createdAt:new Date(item.createdAt),
          },select:{id:true}})
          return saved.id
        })
        items.set(item.id,mapping.destinationRecordId)
        register(mapping.status)
      }
      for(const quote of data.budgets.quotes){
        const itemId=items.get(quote.itemId)
        if(!itemId)throw new LegacyConnectionValidationError()
        const mapping=await legacyMapping.importWithinTransaction(tx,{
          ownerUserId,workspaceId:targetWorkspaceId,entityType:'budget-quote',
          sourceWorkspaceKey:spaceKey,
          sourceKey:sourceKey(ownerUserId,data.workspace.id,'budget-quote',quote.id),
          contentFingerprint:fingerprint(quote),
        },async()=>{
          const saved=await tx.budgetQuote.create({data:{
            itemId,provider:quote.provider,amountCents:quote.amountCents,
            estimatedDays:quote.estimatedDays,materialsIncluded:quote.materialsIncluded,
            notes:quote.notes,selected:quote.selected,
            createdAt:new Date(quote.createdAt),
          },select:{id:true}})
          return saved.id
        })
        register(mapping.status)
      }
      for (const item of data.transactions) {
        const result=await legacyMapping.importWithinTransaction(tx,{
          ownerUserId,workspaceId:targetWorkspaceId,entityType:'transaction',
          sourceWorkspaceKey:spaceKey,
          sourceKey:sourceKey(ownerUserId,data.workspace.id,'transaction',item.id),
          contentFingerprint:fingerprint(item),
        },async()=>{
          const saved=await tx.transaction.create({
            data:{
              workspaceId:targetWorkspaceId,
              description:item.description,category:item.category,amountCents:item.amountCents,
              kind:item.kind==='income'?'INCOME':'EXPENSE',
              occurredOn:new Date(item.occurredOn+'T00:00:00.000Z'),
              createdAt:new Date(item.createdAt),
              ...(item.budgetProjectId?{
                budgetProjectId:projects.get(item.budgetProjectId),
              }:{}),
              ...(item.budgetItemId?{
                budgetItemId:items.get(item.budgetItemId),
              }:{}),
            },
            select:{id:true},
          })
          return saved.id
        })
        register(result.status)
      }
      const total=data.transactions.length+data.bills.length+data.monthlyEntries.length+
        data.fixedExpenses.length+data.budgets.projects.length+
        data.budgets.items.length+data.budgets.quotes.length
      return {status:'completed',workspaceMapping:root.status,created,reused,total}
    },{isolationLevel:'Serializable',maxWait:5000,timeout:20000})
  }
}
