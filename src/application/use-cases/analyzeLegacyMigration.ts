import type { FinancialBackup } from '../../infrastructure/backup/encryptedFinancialBackup'
import { summarizeFinancialBackup } from '../../infrastructure/backup/encryptedFinancialBackup'

/**
 * Simulação 100% local. Não faz fetch, não grava localStorage ou PostgreSQL e
 * não substitui a checagem de autorização/idempotência do futuro importador.
 */
export interface ExistingOnlineSpace {
  id: string
  name: string
  role: 'OWNER' | 'EDITOR' | 'VIEWER'
}
export type MigrationSeverity = 'blocker' | 'warning'
export interface MigrationIssue {
  severity: MigrationSeverity
  code: string
  location: string
  message: string
}
export interface MigrationPreview {
  total: ReturnType<typeof summarizeFinancialBackup>
  blockers: number
  warnings: number
  issues: MigrationIssue[]
  truncated: boolean
  requiresRemapping: number
  readyForImportDesign: boolean
  cloudComparison: 'workspace-names-only' | 'not-checked'
}

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const YM = /^\d{4}-(0[1-9]|1[0-2])$/
const MAX_CENTS = 2_147_483_647
const MAX_VISIBLE_ISSUES = 80
const STATUS = new Set(['planning', 'quoting', 'approved', 'in-progress', 'completed'])
function obj(v: unknown): v is Record<string, unknown> { return v !== null && typeof v === 'object' && !Array.isArray(v) }
function str(v: unknown, max: number): v is string { return typeof v === 'string' && v.trim().length > 0 && v.length <= max }
function maybeString(v: unknown, max: number): boolean { return typeof v === 'string' && v.length <= max }
function cents(v: unknown, positive = true): boolean {
  return Number.isSafeInteger(v) && (v as number) >= (positive ? 1 : 0) && (v as number) <= MAX_CENTS
}
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const asDate = new Date(value + 'T00:00:00.000Z')
  return !Number.isNaN(asDate.valueOf()) && asDate.toISOString().slice(0, 10) === value
}
function timestamp(value: unknown): boolean {
  return typeof value === 'string' && value.length <= 35 &&
    !Number.isNaN(Date.parse(value))
}
function month(value: unknown): value is string { return typeof value === 'string' && YM.test(value) }
function nameKey(value: string): string { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR') }

function idCollection(
  list: readonly unknown[], section: string, report: (issue: MigrationIssue) => void,
): Map<string, Record<string, unknown>> {
  const entries = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (!obj(item) || !str(item.id, 128)) {
      report({ severity: 'blocker', code: 'INVALID_ID', location: section + ' #' + (i + 1),
        message: 'Registro sem identificador local válido.' })
      continue
    }
    if (entries.has(item.id)) {
      report({ severity: 'blocker', code: 'DUPLICATED_ID', location: section,
        message: 'Existem identificadores repetidos nesta categoria.' })
    } else entries.set(item.id, item)
  }
  return entries
}

export function analyzeLegacyMigration(
  backup: FinancialBackup, onlineSpaces: readonly ExistingOnlineSpace[] | null,
): MigrationPreview {
  const total = summarizeFinancialBackup(backup)
  let blockers = 0
  let warnings = 0
  const issues: MigrationIssue[] = []
  function report(issue: MigrationIssue): void {
    if (issue.severity === 'blocker') blockers++
    else warnings++
    if (issues.length < MAX_VISIBLE_ISSUES) issues.push(issue)
  }

  const existing = new Map<string, ExistingOnlineSpace[]>()
  if (onlineSpaces === null) report({
    severity: 'warning', code: 'CLOUD_COMPARISON_UNAVAILABLE',
    location: 'Espaços online',
    message: 'A API está indisponível; os nomes e registros existentes na nuvem ainda precisam ser comparados.',
  })
  for (const space of onlineSpaces ?? []) {
    if (!str(space.name, 60) || !str(space.id, 90) ||
        !['OWNER', 'EDITOR', 'VIEWER'].includes(space.role)) {
      throw new Error('A consulta de espaços online retornou dados inesperados.')
    }
    const key = nameKey(space.name)
    existing.set(key, [...(existing.get(key) ?? []), space])
  }

  const localNames = new Set<string>()
  for (const entry of backup.workspaces) {
    const workspace = entry.workspace
    // Dados brutos podem ter sido escritos por uma versão antiga do programa.
    const label = str(workspace.name, 60) ? workspace.name : 'Espaço sem nome'
    const at = 'Espaço: ' + label.slice(0, 60)
    const name = nameKey(label)
    if (!str(workspace.name, 60)) report({ severity: 'blocker', code: 'INVALID_SPACE_NAME', location: at,
      message: 'Nome do espaço incompatível com o limite de 60 caracteres do banco.' })
    if (!timestamp(workspace.createdAt)) report({ severity: 'blocker', code: 'INVALID_SPACE_DATE', location: at,
      message: 'Data de criação do espaço está inválida.' })
    if (localNames.has(name)) report({ severity: 'blocker', code: 'DUPLICATED_SPACE_NAME', location: at,
      message: 'Existem dois espaços locais com o mesmo nome.' })
    localNames.add(name)

    const sameName = existing.get(name) ?? []
    if (sameName.length) report({ severity: 'blocker', code: 'ONLINE_NAME_CONFLICT', location: at,
      message: 'Já existe um espaço com esse nome na nuvem. É necessário escolher como conciliar os registros sem duplicar ou sobrescrever.' })

    const bills = idCollection(entry.bills, at + ' / Contas', report)
    const monthly = idCollection(entry.monthlyEntries, at + ' / Históricos', report)
    const fixed = idCollection(entry.fixedExpenses, at + ' / Gastos fixos', report)
    const projects = idCollection(entry.budgets.projects, at + ' / Projetos', report)
    const items = idCollection(entry.budgets.items, at + ' / Itens', report)
    idCollection(entry.budgets.quotes, at + ' / Cotações', report)
    idCollection(entry.transactions, at + ' / Lançamentos', report)
    void monthly
    void fixed

    const monthlyPairs = new Set<string>()
    for (const bill of entry.bills) {
      if (!str(bill.name, 80) || !Number.isInteger(bill.dueDay) || bill.dueDay < 1 || bill.dueDay > 31 ||
          typeof bill.active !== 'boolean' || !timestamp(bill.createdAt)) {
        report({ severity: 'blocker', code: 'INVALID_BILL', location: at + ' / Contas',
          message: 'Uma conta mensal possui nome, vencimento, status ou data incompatível com a nuvem.' })
      }
    }
    for (const bill of entry.monthlyEntries) {
      if (!str(bill.billId, 128) || !bills.has(bill.billId)) report({
        severity: 'blocker', code: 'ORPHAN_MONTHLY_ENTRY', location: at + ' / Históricos',
        message: 'Um histórico mensal aponta para uma conta que não existe neste espaço.',
      })
      if (!month(bill.yearMonth) || !cents(bill.amountCents) ||
          !['paid', 'pending'].includes(bill.status as string) ||
          !(bill.paidAt === null || timestamp(bill.paidAt))) report({
        severity: 'blocker', code: 'INVALID_MONTHLY_ENTRY', location: at + ' / Históricos',
        message: 'Mês, valor, status ou data de pagamento inválidos.',
      })
      if (str(bill.billId, 128) && month(bill.yearMonth)) {
        const pair = bill.billId + '|' + bill.yearMonth
        if (monthlyPairs.has(pair)) report({ severity: 'blocker', code: 'DUPLICATED_MONTH',
          location: at + ' / Históricos', message: 'A mesma conta possui dois registros do mesmo mês.' })
        monthlyPairs.add(pair)
      }
      if (bill.status === 'paid' && bill.paidAt === null) report({
        severity: 'warning', code: 'MISSING_PAYMENT_TIME', location: at + ' / Históricos',
        message: 'Um histórico pago não informa quando foi quitado. A migração não deve inventar essa data.',
      })
    }
    for (const expense of entry.fixedExpenses) {
      if (!str(expense.name, 80) || !cents(expense.amountCents) ||
          !Number.isInteger(expense.dueDay) || expense.dueDay < 1 || expense.dueDay > 31 ||
          !month(expense.startMonth) || !(expense.endBeforeMonth === null || month(expense.endBeforeMonth)) ||
          !timestamp(expense.createdAt) || !Array.isArray(expense.paidMonths)) {
        report({ severity: 'blocker', code: 'INVALID_FIXED', location: at + ' / Gastos fixos',
          message: 'Um gasto fixo contém campos incompatíveis com a nuvem.' })
        continue
      }
      if (expense.endBeforeMonth && expense.endBeforeMonth <= expense.startMonth) report({
        severity: 'blocker', code: 'INVALID_FIXED_RANGE', location: at + ' / Gastos fixos',
        message: 'O mês final de um gasto fixo não pode anteceder ou coincidir com o mês inicial.',
      })
      const seenPaid = new Set<string>()
      for (const paid of expense.paidMonths) {
        if (!month(paid) || seenPaid.has(paid)) report({
          severity: 'blocker', code: 'INVALID_FIXED_PAYMENT', location: at + ' / Gastos fixos',
          message: 'Um mês de pagamento está inválido ou repetido.',
        })
        else seenPaid.add(paid)
      }
      if (expense.paidMonths.length) report({ severity: 'warning', code: 'FIXED_PAYMENT_DATES_UNKNOWN',
        location: at + ' / Gastos fixos',
        message: 'O navegador registra apenas meses pagos, mas a nuvem exige data de pagamento; não será inventada automaticamente.',
      })
    }

    for (const project of entry.budgets.projects) {
      if (!str(project.title, 120) || !str(project.category, 40) ||
          !cents(project.targetCents) || !STATUS.has(project.status) ||
          !maybeString(project.notes, 4000) || !timestamp(project.createdAt)) report({
        severity: 'blocker', code: 'INVALID_PROJECT', location: at + ' / Orçamentos',
        message: 'Um projeto possui valor, status, data ou texto incompatível com o banco.',
      })
    }
    for (const item of entry.budgets.items) {
      if (!str(item.projectId, 128) || !projects.has(item.projectId)) report({
        severity: 'blocker', code: 'ORPHAN_BUDGET_ITEM', location: at + ' / Orçamentos',
        message: 'Um item está vinculado a um projeto inexistente.',
      })
      if (!str(item.title, 120) || !(item.plannedCents === null || cents(item.plannedCents)) ||
          !timestamp(item.createdAt)) report({ severity: 'blocker', code: 'INVALID_BUDGET_ITEM',
        location: at + ' / Orçamentos', message: 'Um item de orçamento contém título, preço ou data inválidos.' })
    }
    for (const quote of entry.budgets.quotes) {
      if (!str(quote.itemId, 128) || !items.has(quote.itemId)) report({
        severity: 'blocker', code: 'ORPHAN_QUOTE', location: at + ' / Orçamentos',
        message: 'Uma cotação está vinculada a um item inexistente.',
      })
      if (!str(quote.provider, 120) || !cents(quote.amountCents) ||
          !(quote.estimatedDays === null || (Number.isInteger(quote.estimatedDays) &&
              quote.estimatedDays >= 0 && quote.estimatedDays <= 2147483647)) ||
          typeof quote.materialsIncluded !== 'boolean' || !maybeString(quote.notes, 4000) ||
          typeof quote.selected !== 'boolean' || !timestamp(quote.createdAt)) report({
        severity: 'blocker', code: 'INVALID_QUOTE', location: at + ' / Orçamentos',
        message: 'Uma cotação contém valores ou campos incompatíveis com o banco.',
      })
    }
    for (const transaction of entry.transactions) {
      if (!str(transaction.description, 120) || !str(transaction.category, 40) ||
          !cents(transaction.amountCents) || !['income', 'expense'].includes(transaction.kind as string) ||
          !validDate(transaction.occurredOn) || !timestamp(transaction.createdAt)) report({
        severity: 'blocker', code: 'INVALID_TRANSACTION', location: at + ' / Lançamentos',
        message: 'Um lançamento possui descrição, categoria, valor, tipo ou data inválidos.',
      })
      if (transaction.budgetProjectId !== undefined && !projects.has(transaction.budgetProjectId)) report({
        severity: 'blocker', code: 'ORPHAN_TRANSACTION_PROJECT', location: at + ' / Lançamentos',
        message: 'Um lançamento aponta para um projeto de orçamento inexistente.',
      })
      if (transaction.budgetItemId !== undefined && !items.has(transaction.budgetItemId)) report({
        severity: 'blocker', code: 'ORPHAN_TRANSACTION_ITEM', location: at + ' / Lançamentos',
        message: 'Um lançamento aponta para um item de orçamento inexistente.',
      })
      if (transaction.budgetProjectId !== undefined && transaction.budgetItemId !== undefined &&
          items.get(transaction.budgetItemId)?.projectId !== transaction.budgetProjectId) report({
        severity: 'blocker', code: 'INVALID_TRANSACTION_BUDGET_LINK', location: at + ' / Lançamentos',
        message: 'O item e o projeto ligados ao lançamento não pertencem ao mesmo orçamento.',
      })
    }
  }
  // Cada registro local precisa de um novo ID alvo estável; preservaremos o ID
  // antigo como rastreabilidade na fase de importação (não nesta simulação).
  const requiresRemapping = Object.values(total).reduce((sum, count) => sum + count, 0)
  return {
    total, blockers, warnings, issues,
    truncated: issues.length < blockers + warnings,
    requiresRemapping,
    readyForImportDesign: blockers === 0 && onlineSpaces !== null,
    cloudComparison: onlineSpaces === null ? 'not-checked' : 'workspace-names-only',
  }
}
