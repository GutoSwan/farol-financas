import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { PrismaClient } from '@prisma/client'
import { PrismaLegacyImportMappingService, LegacyMappingConflictError } from '../infrastructure/repositories/PrismaLegacyImportMappingService.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isoDate = z.iso.date().refine(value => new Date(value + 'T00:00:00.000Z').toISOString().slice(0,10) === value)
const timestamp = z.string().min(1).max(70).refine(v => !Number.isNaN(Date.parse(v)))
const workspaceSchema = z.object({
  id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().min(1).max(60).refine(v => !!v.trim()),
  createdAt: timestamp,
}).strict()
const transactionSchema = z.object({
  id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  description: z.string().min(1).max(120).refine(v => !!v.trim()),
  category: z.string().min(1).max(40).refine(v => !!v.trim()),
  amountCents: z.number().int().min(1).max(2147483647),
  kind: z.enum(['income','expense']),
  occurredOn: isoDate,
  createdAt: timestamp,
  // Vínculos orçamentários exigem importar primeiro seus registros pai.
  // Esta primeira etapa recusa essas transações; nunca descarta os vínculos.
}).strict()
const schema = z.object({
  workspace: workspaceSchema,
  transactions: z.array(transactionSchema).max(25),
}).strict()

export type TransactionConnectionPayload = z.infer<typeof schema>
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
    super('Lote inválido ou incompatível com a migração segura de lançamentos.')
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
 * Não permite importar contas, orçamentos ou pagamentos nesta etapa.
 * Nenhuma rota chama esta classe sem flag explícita no servidor.
 */
export class PrismaLegacyTransactionConnectionService implements LegacyConnectionService {
  constructor(private readonly prisma: PrismaClient) {}

  async connect(ownerUserId: string, targetWorkspaceId: string, raw: unknown): Promise<LegacyConnectionResult> {
    const parsed = schema.safeParse(raw)
    if (!UUID.test(ownerUserId) || !UUID.test(targetWorkspaceId) || !parsed.success) {
      throw new LegacyConnectionValidationError()
    }
    const data = parsed.data
    if (new Set(data.transactions.map(x => x.id)).size !== data.transactions.length) {
      throw new LegacyConnectionValidationError()
    }
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
            },
            select:{id:true},
          })
          return saved.id
        })
        if (result.status==='created')created++
        else reused++
      }
      return {status:'completed',workspaceMapping:root.status,created,reused,total:data.transactions.length}
    },{isolationLevel:'Serializable',maxWait:5000,timeout:20000})
  }
}
