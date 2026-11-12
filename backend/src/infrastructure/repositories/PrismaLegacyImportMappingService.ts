import type { Prisma, PrismaClient } from '@prisma/client'

// Esta camada NÃO expõe rota HTTP de importação. A criação do registro alvo
// deve ocorrer no callback dentro da MESMA transação Prisma. Senão o banco
// poderia guardar correspondências para dados inexistentes.
export type LegacyMappingKind = 'workspace' | 'bill' | 'monthly-entry' |
  'fixed-expense' | 'fixed-payment' | 'transaction' |
  'budget-project' | 'budget-item' | 'budget-quote'

export interface LegacyMappingSource {
  /** Deve vir da identidade verificada pelo servidor, nunca de campo HTTP. */
  ownerUserId: string
  /** UUID de espaço online cuja associação OWNER foi verificada no servidor. */
  workspaceId: string
  entityType: LegacyMappingKind
  /** sourceKey do manifesto para a linha 'workspace' do mesmo espaço local. */
  sourceWorkspaceKey: string
  sourceKey: string
  contentFingerprint: string
  needsPaymentDateReview?: boolean
}

export interface LegacyMappingResult {
  status: 'created' | 'reused'
  destinationRecordId: string
}

type TargetFactory = (tx: Prisma.TransactionClient) => Promise<string>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA = /^[0-9a-f]{64}$/
const TYPES: readonly LegacyMappingKind[] = [
  'workspace', 'bill', 'monthly-entry', 'fixed-expense', 'fixed-payment',
  'transaction', 'budget-project', 'budget-item', 'budget-quote',
]

export class LegacyMappingConflictError extends Error {
  constructor() {
    super('Conflito entre o registro local e sua correspondência na nuvem. Nenhuma alteração foi concluída.')
    this.name = 'LegacyMappingConflictError'
  }
}

export function validateLegacyMappingSource(input: LegacyMappingSource): void {
  if (!UUID.test(input.ownerUserId) || !UUID.test(input.workspaceId) ||
      !TYPES.includes(input.entityType) || !SHA.test(input.sourceKey) ||
      !SHA.test(input.sourceWorkspaceKey) || !SHA.test(input.contentFingerprint)) {
    throw new Error('Identificadores de importação inválidos.')
  }
  if (input.entityType === 'fixed-payment' || input.needsPaymentDateReview) {
    throw new Error('Pagamento legado sem data de quitação: importação exige revisão manual.')
  }
  if (input.entityType === 'workspace' && input.sourceWorkspaceKey !== input.sourceKey) {
    throw new Error('A identidade do espaço local está inconsistente.')
  }
  if (input.entityType !== 'workspace' && input.sourceWorkspaceKey === input.sourceKey) {
    throw new Error('Identidade de registro não pode coincidir com a identidade do espaço.')
  }
}

async function ensureOwner(tx: Prisma.TransactionClient, input: LegacyMappingSource): Promise<void> {
  const membership = await tx.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: input.ownerUserId, workspaceId: input.workspaceId } },
    select: { role: true },
  })
  if (membership?.role !== 'OWNER') {
    throw new Error('Apenas o proprietário autenticado pode importar para este espaço.')
  }
}

async function ensureWorkspaceMapped(tx: Prisma.TransactionClient, input: LegacyMappingSource): Promise<void> {
  if (input.entityType === 'workspace') return
  const root = await tx.legacyImportMapping.findUnique({
    where: { ownerUserId_sourceKey: {
      ownerUserId: input.ownerUserId, sourceKey: input.sourceWorkspaceKey,
    } },
  })
  if (root?.entityType !== 'workspace' ||
      root.workspaceId !== input.workspaceId ||
      root.destinationRecordId !== input.workspaceId ||
      root.sourceWorkspaceKey !== input.sourceWorkspaceKey) {
    throw new Error('O espaço legado ainda não está associado ao espaço online autorizado.')
  }
}

// A FK polimórfica é conferida no backend ANTES de gravar o mapeamento.
// Para registros filhos, inclui o filtro de pertencimento pelo ancestral.
async function ensureTargetInWorkspace(
  tx: Prisma.TransactionClient, kind: LegacyMappingKind, workspaceId: string, recordId: string,
): Promise<void> {
  let target: { id: string } | null
  switch (kind) {
    case 'workspace':
      if (recordId !== workspaceId) throw new Error('Destino do espaço não corresponde ao espaço autorizado.')
      target = await tx.workspace.findFirst({ where: { id: recordId }, select: { id: true } })
      break
    case 'bill':
      target = await tx.recurringBill.findFirst({ where: { id: recordId, workspaceId }, select: { id: true } })
      break
    case 'monthly-entry':
      target = await tx.monthlyBillEntry.findFirst({
        where: { id: recordId, bill: { workspaceId } }, select: { id: true },
      })
      break
    case 'fixed-expense':
      target = await tx.fixedExpense.findFirst({ where: { id: recordId, workspaceId }, select: { id: true } })
      break
    case 'fixed-payment':
      // Este caso está bloqueado na validação até existir uma data de quitação verificável.
      throw new Error('Pagamento legado não pode ser importado automaticamente.')
    case 'transaction':
      target = await tx.transaction.findFirst({ where: { id: recordId, workspaceId }, select: { id: true } })
      break
    case 'budget-project':
      target = await tx.budgetProject.findFirst({ where: { id: recordId, workspaceId }, select: { id: true } })
      break
    case 'budget-item':
      target = await tx.budgetItem.findFirst({
        where: { id: recordId, project: { workspaceId } }, select: { id: true },
      })
      break
    case 'budget-quote':
      target = await tx.budgetQuote.findFirst({
        where: { id: recordId, item: { project: { workspaceId } } }, select: { id: true },
      })
      break
  }
  if (!target) {
    throw new Error('Registro de destino não existe no espaço financeiro autorizado.')
  }
}

/**
 * Etapa de INFRAESTRUTURA para o importador futuro.
 *
 * 1. Execução com transação única entre criação de registro e correspondência.
 * 2. ownerId vem do JWT/AAL2 validado no backend que chamará este serviço.
 * 3. Repetição exata reutiliza o ID existente, sem executar createTarget outra vez.
 * 4. Conteúdo ou destino diferente NÃO substitui o registro já importado.
 * 5. Concorrência com violação UNIQUE cancela a transação inteira; o caller
 *    poderá iniciar NOVA transação e reutilizar a linha existente.
 *
 * Nenhuma rota chama este serviço ainda. Não habilita escritas na Preview.
 */
export class PrismaLegacyImportMappingService {
  constructor(private readonly prisma: PrismaClient) {}

  async importOnce(source: LegacyMappingSource, createTarget: TargetFactory): Promise<LegacyMappingResult> {
    validateLegacyMappingSource(source)
    return this.prisma.$transaction(async tx => {
      await ensureOwner(tx, source)
      await ensureWorkspaceMapped(tx, source)

      const existing = await tx.legacyImportMapping.findUnique({
        where: { ownerUserId_sourceKey: { ownerUserId: source.ownerUserId, sourceKey: source.sourceKey } },
      })
      if (existing) {
        if (existing.workspaceId !== source.workspaceId ||
            existing.entityType !== source.entityType ||
            existing.sourceWorkspaceKey !== source.sourceWorkspaceKey ||
            existing.contentFingerprint !== source.contentFingerprint) {
          throw new LegacyMappingConflictError()
        }
        await ensureTargetInWorkspace(tx, source.entityType, source.workspaceId, existing.destinationRecordId)
        return { status: 'reused', destinationRecordId: existing.destinationRecordId }
      }

      const destinationRecordId = await createTarget(tx)
      if (!UUID.test(destinationRecordId)) throw new Error('Identificador do destino inválido.')
      await ensureTargetInWorkspace(tx, source.entityType, source.workspaceId, destinationRecordId)
      // UNIQUE (ownerUserId,sourceKey) e (entityType,destinationRecordId)
      // cobrem tentativas simultâneas. NÃO usar upsert com update do conteúdo.
      await tx.legacyImportMapping.create({
        data: {
          ownerUserId: source.ownerUserId,
          workspaceId: source.workspaceId,
          entityType: source.entityType,
          sourceWorkspaceKey: source.sourceWorkspaceKey,
          sourceKey: source.sourceKey,
          contentFingerprint: source.contentFingerprint,
          destinationRecordId,
        },
      })
      return { status: 'created', destinationRecordId }
    })
  }
}
