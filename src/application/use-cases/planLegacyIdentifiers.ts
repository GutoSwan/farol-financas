import type { FinancialBackup } from '../../infrastructure/backup/encryptedFinancialBackup'
import { analyzeLegacyMigration } from './analyzeLegacyMigration'

export type LegacyEntityType =
  | 'workspace' | 'bill' | 'monthly-entry' | 'fixed-expense'
  | 'fixed-payment' | 'transaction' | 'budget-project' | 'budget-item' | 'budget-quote'

export interface LegacyEntityReference {
  type: LegacyEntityType
  /** O identificador vem dos dados legados, nunca é ID de autorização remoto. */
  sourceWorkspaceId: string
  sourceId: string
  /** SHA-256 do titular + espaço + tipo + identificador legado. */
  sourceKey: string
  /** SHA-256 do conteúdo, para detectar alteração de registros entre tentativas. */
  contentFingerprint: string
  /** Pagamentos de gastos fixos não têm data/hora de quitação no legado. */
  needsPaymentDateReview: boolean
}

export interface LegacyIdentityManifest {
  format: 'farol-financas-import-identity-preview'
  version: 1
  records: LegacyEntityReference[]
  requiresPaymentDateReview: number
  contentFingerprint: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_ENTRIES = 12_000
const encoder = new TextEncoder()

async function hash(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Não é possível verificar as identidades locais sem criptografia segura.')
  }
  const bytes = encoder.encode(JSON.stringify(value))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, '0')).join('')
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== 'object') return value
  const original = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(original).sort()) sorted[key] = canonical(original[key])
  return sorted
}

/**
 * Plano local, SOMENTE LEITURA. O servidor ainda precisará validar o JWT e AAL2,
 * autorizar o dono, comparar registros existentes, reservar chaves UNIQUE em SQL,
 * gerar UUIDs e executar tudo em transação. Estes hashes não concedem permissão.
 */
export async function planLegacyIdentifiers(
  backup: FinancialBackup, ownerUserId: string,
): Promise<LegacyIdentityManifest> {
  if (!UUID.test(ownerUserId)) throw new Error('Titular de migração inválido.')
  const diagnosis = analyzeLegacyMigration(backup, null)
  if (diagnosis.blockers > 0) {
    throw new Error('Há incompatibilidades nos registros locais. Resolva-as antes de preparar a correspondência.')
  }
  const estimated = Object.values(diagnosis.total).reduce((a, b) => a + b, 0) +
    backup.workspaces.reduce((sum, space) =>
      sum + space.fixedExpenses.reduce((paid, expense) => paid + expense.paidMonths.length, 0), 0)
  if (estimated > MAX_ENTRIES) throw new Error('Muitos registros para o lote de migração. Divida em lotes menores.')
  const records: LegacyEntityReference[] = []
  async function add(type: LegacyEntityType, workspaceId: string, legacyId: string,
      value: unknown, needsPaymentDateReview = false): Promise<void> {
    const sourceKey = await hash(['farol:legacy:source-key:v1', ownerUserId, workspaceId, type, legacyId])
    const contentFingerprint = await hash(['farol:legacy:record-content:v1', canonical(value)])
    records.push({ type, sourceWorkspaceId: workspaceId, sourceId: legacyId,
      sourceKey, contentFingerprint, needsPaymentDateReview })
  }
  for (const entry of backup.workspaces) {
    const spaceId = entry.workspace.id
    await add('workspace', spaceId, spaceId, entry.workspace)
    for (const bill of entry.bills) await add('bill', spaceId, bill.id, bill)
    for (const month of entry.monthlyEntries) {
      // A chave lógica reconhecida pelo PostgreSQL é (billId, yearMonth).
      // O ID legado pode mudar sem que isso represente uma mensalidade nova.
      await add('monthly-entry', spaceId, JSON.stringify([month.billId, month.yearMonth]), month)
    }
    for (const fixed of entry.fixedExpenses) {
      await add('fixed-expense', spaceId, fixed.id, fixed)
      for (const paidMonth of fixed.paidMonths) {
        await add('fixed-payment', spaceId, JSON.stringify([fixed.id, paidMonth]),
          { fixedExpenseId: fixed.id, yearMonth: paidMonth }, true)
      }
    }
    for (const transaction of entry.transactions) await add('transaction', spaceId, transaction.id, transaction)
    for (const project of entry.budgets.projects) await add('budget-project', spaceId, project.id, project)
    for (const item of entry.budgets.items) await add('budget-item', spaceId, item.id, item)
    for (const quote of entry.budgets.quotes) await add('budget-quote', spaceId, quote.id, quote)
  }
  // Ordenação independente da ordem original dos arrays.
  records.sort((a, b) => a.sourceKey.localeCompare(b.sourceKey))
  const unique = new Set(records.map(row => row.sourceKey))
  if (unique.size !== records.length) throw new Error('Foram encontradas chaves de origem duplicadas.')
  return {
    format: 'farol-financas-import-identity-preview', version: 1,
    records,
    requiresPaymentDateReview: records.filter(row => row.needsPaymentDateReview).length,
    contentFingerprint: await hash(records.map(row =>
      [row.sourceKey, row.contentFingerprint, row.needsPaymentDateReview])),
  }
}
