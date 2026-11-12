import type { FinancialBackup, FinancialBackupSummary } from './encryptedFinancialBackup'
import { summarizeFinancialBackup } from './encryptedFinancialBackup'
import { buildLocalFinancialBackup } from '../../application/use-cases/exportFinancialBackup'
import { DEFAULT_WORKSPACE, DEFAULT_WORKSPACE_ID } from '../../domain/entities/FinancialWorkspace'
import { ACTIVE_KEY, WORKSPACES_KEY } from '../persistence/BrowserWorkspaceRepository'
import { billsStorageKey } from '../persistence/BrowserBillRepository'
import { transactionStorageKey } from '../persistence/BrowserTransactionRepository'
import { budgetStorageKey } from '../persistence/BrowserBudgetRepository'
import { localLegacyAccess, isLegacyOwnerSession } from '../persistence/legacyAccess'

/**
 * Restauração LOCAL, sem mesclagem. A origem precisa ser um backup desta conta
 * já descriptografado pelo módulo AES-GCM e confirmado na interface.
 * Nunca tocar no registro de vínculo de usuário, tokens, presentes ou fotos.
 */
const ID = /^[A-Za-z0-9_-]{1,128}$/
const YM = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/
const STATES = new Set(['planning', 'quoting', 'approved', 'in-progress', 'completed'])
type Row = Record<string, unknown>
const row = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value)
const str = (value: unknown, max = 500) => typeof value === 'string' && value.length <= max
const id = (value: unknown): value is string => typeof value === 'string' && ID.test(value)
const cents = (value: unknown, min = 0) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min
const month = (value: unknown): value is string => typeof value === 'string' && YM.test(value)
const date = (value: unknown): value is string => typeof value === 'string' && DATE.test(value)
const iso = (value: unknown) => str(value, 70) && !Number.isNaN(Date.parse(value as string))

function allUnique<T extends { id: string }>(items: T[]): boolean {
  const ids = items.map(item => item.id)
  return ids.every(id) && new Set(ids).size === ids.length
}
function fail(reason: string): never {
  throw new Error('Backup incompatível com a restauração: ' + reason + '. Nenhum registro foi alterado.')
}

export function validateRestorableFinancialBackup(snapshot: FinancialBackup): FinancialBackupSummary {
  const summary = summarizeFinancialBackup(snapshot)
  if (JSON.stringify(snapshot).length > 6 * 1024 * 1024) fail('tamanho acima do limite')
  if (snapshot.workspaces[0]?.workspace.id !== DEFAULT_WORKSPACE_ID ||
      JSON.stringify(snapshot.workspaces[0].workspace) !== JSON.stringify(DEFAULT_WORKSPACE)) {
    fail('o espaço inicial não corresponde à versão do Farol')
  }
  const spaceIds = new Set(snapshot.workspaces.map(item => item.workspace.id))
  if (spaceIds.size !== snapshot.workspaces.length) fail('espaços duplicados')
  for (const group of snapshot.workspaces) {
    const { workspace, bills, monthlyEntries, fixedExpenses, transactions, budgets } = group
    if (!id(workspace.id) || !str(workspace.name, 60) || !iso(workspace.createdAt) ||
        !allUnique(bills) || !allUnique(monthlyEntries) ||
        !allUnique(fixedExpenses) || !allUnique(transactions) ||
        !allUnique(budgets.projects) || !allUnique(budgets.items) ||
        !allUnique(budgets.quotes)) fail('identificadores ou espaços inválidos')
    const billIds = new Set(bills.map(bill => bill.id))
    const projectIds = new Set(budgets.projects.map(project => project.id))
    const itemIds = new Set(budgets.items.map(item => item.id))
    for (const bill of bills) {
      if (!id(bill.id) || !str(bill.name, 100) || !Number.isInteger(bill.dueDay) ||
          bill.dueDay < 1 || bill.dueDay > 31 || typeof bill.active !== 'boolean' ||
          !str(bill.createdAt, 70)) fail('contas mensais inválidas')
    }
    for (const entry of monthlyEntries) {
      if (!id(entry.id) || !billIds.has(entry.billId) || !month(entry.yearMonth) ||
          !cents(entry.amountCents) || !['paid','pending'].includes(entry.status) ||
          (entry.paidAt !== null && !iso(entry.paidAt))) fail('histórico mensal inválido')
    }
    for (const fixed of fixedExpenses) {
      if (!id(fixed.id) || !str(fixed.name, 100) || !cents(fixed.amountCents) ||
          !Number.isInteger(fixed.dueDay) || fixed.dueDay < 1 || fixed.dueDay > 31 ||
          !month(fixed.startMonth) ||
          (fixed.endBeforeMonth !== null && !month(fixed.endBeforeMonth)) ||
          !Array.isArray(fixed.paidMonths) || !fixed.paidMonths.every(month) ||
          !str(fixed.createdAt, 70)) fail('gastos fixos inválidos')
    }
    for (const project of budgets.projects) {
      if (!id(project.id) || !str(project.title, 200) || !str(project.category, 100) ||
          !cents(project.targetCents) || !STATES.has(project.status) ||
          !str(project.notes, 2000) || !str(project.createdAt, 70)) fail('projetos de orçamento inválidos')
    }
    for (const item of budgets.items) {
      if (!id(item.id) || !projectIds.has(item.projectId) || !str(item.title, 200) ||
          (item.plannedCents !== null && !cents(item.plannedCents)) ||
          !str(item.createdAt, 70)) fail('itens de orçamento inválidos')
    }
    for (const quote of budgets.quotes) {
      if (!id(quote.id) || !itemIds.has(quote.itemId) || !str(quote.provider, 200) ||
          !cents(quote.amountCents) ||
          (quote.estimatedDays !== null && !cents(quote.estimatedDays)) ||
          typeof quote.materialsIncluded !== 'boolean' ||
          typeof quote.selected !== 'boolean' || !str(quote.notes, 2000) ||
          !str(quote.createdAt, 70)) fail('cotações inválidas')
    }
    for (const tx of transactions) {
      if (!id(tx.id) || !str(tx.description, 200) || !str(tx.category, 100) ||
          !cents(tx.amountCents, 1) || !['income','expense'].includes(tx.kind) ||
          !date(tx.occurredOn) || !str(tx.createdAt, 70) ||
          (tx.budgetProjectId !== undefined && !projectIds.has(tx.budgetProjectId)) ||
          (tx.budgetItemId !== undefined && !itemIds.has(tx.budgetItemId))) {
        fail('lançamentos inválidos')
      }
    }
  }
  return summary
}

function emptyTarget(): void {
  const current = buildLocalFinancialBackup()
  const summary = summarizeFinancialBackup(current)
  if (summary.spaces !== 1 || current.activeWorkspaceId !== DEFAULT_WORKSPACE_ID ||
      summary.bills || summary.monthlyEntries || summary.fixedExpenses ||
      summary.transactions || summary.budgetProjects || summary.budgetItems ||
      summary.budgetQuotes) {
    throw new Error('Este navegador já contém registros financeiros. Nada foi substituído. Use um perfil de navegador vazio, vinculado à mesma conta, para restaurar.')
  }
}

/** Consulta somente leitura para a interface. */
export function mayRestoreIntoCurrentBrowser(ownerId: string): boolean {
  if (!isLegacyOwnerSession() || localLegacyAccess(ownerId) !== 'allowed') return false
  try {
    emptyTarget()
    return true
  } catch {
    return false
  }
}

/**
 * Restauração deliberadamente só para destino vazio. Sem limpeza/mesclagem.
 * Rollback de melhor esforço para falhas de quota, escrita e verificação.
 */
export function restoreLocalFinancialBackup(
  snapshot: FinancialBackup, expectedOwnerId: string,
): FinancialBackupSummary {
  if (!isLegacyOwnerSession() || localLegacyAccess(expectedOwnerId) !== 'allowed') {
    throw new Error('A conta atual não está autorizada a restaurar registros neste navegador.')
  }
  const summary = validateRestorableFinancialBackup(snapshot)
  emptyTarget()

  const values = new Map<string, string>()
  for (const part of snapshot.workspaces) {
    const workspaceId = part.workspace.id
    values.set(billsStorageKey(workspaceId), JSON.stringify({
      bills: part.bills, entries: part.monthlyEntries,
    }))
    values.set(billsStorageKey(workspaceId) + ':fixed-expenses:v1', JSON.stringify(part.fixedExpenses))
    values.set(transactionStorageKey(workspaceId), JSON.stringify(part.transactions))
    values.set(budgetStorageKey(workspaceId), JSON.stringify(part.budgets))
  }
  values.set(WORKSPACES_KEY, JSON.stringify(
    snapshot.workspaces.filter(part => part.workspace.id !== DEFAULT_WORKSPACE_ID)
      .map(part => part.workspace),
  ))
  values.set(ACTIVE_KEY, snapshot.activeWorkspaceId)

  const originals = new Map<string, string | null>()
  try {
    for (const key of values.keys()) {
      const original = localStorage.getItem(key)
      // Dados de espaço fora da lista atual podem ser restos de exclusões
      // antigas. Nunca sobrescrever nem esses registros órfãos.
      if (original !== null &&
          snapshot.workspaces.some(part => part.workspace.id !== DEFAULT_WORKSPACE_ID &&
            [billsStorageKey(part.workspace.id), billsStorageKey(part.workspace.id)+':fixed-expenses:v1',
             transactionStorageKey(part.workspace.id),budgetStorageKey(part.workspace.id)].includes(key))) {
        throw new Error('Existe um registro antigo com identificador coincidente. Nada foi sobrescrito.')
      }
      originals.set(key, original)
    }
  } catch {
    throw new Error('Não foi possível conferir as chaves de destino; nenhum dado foi restaurado.')
  }

  const touched: string[] = []
  try {
    for (const [key, value] of values) {
      touched.push(key)
      localStorage.setItem(key, value)
      if (localStorage.getItem(key) !== value) throw new Error('Falha ao conferir gravação.')
    }
    const restored = buildLocalFinancialBackup()
    if (restored.activeWorkspaceId !== snapshot.activeWorkspaceId ||
        JSON.stringify(restored.workspaces) !== JSON.stringify(snapshot.workspaces)) {
      throw new Error('Os registros gravados não correspondem ao backup.')
    }
  } catch {
    let rollbackFailed = false
    for (const key of touched.reverse()) {
      try {
        const original = originals.get(key)
        if (original === null || original === undefined) localStorage.removeItem(key)
        else localStorage.setItem(key, original)
      } catch { rollbackFailed = true }
    }
    if (rollbackFailed) {
      throw new Error('Falha na restauração e recuperação incompleta dos registros anteriores. Não limpe o navegador; preserve o backup criptografado.')
    }
    throw new Error('Falha ao restaurar. O navegador voltou ao estado anterior; nenhum dado foi substituído.')
  }
  return summary
}
