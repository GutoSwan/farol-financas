import type { BudgetProject } from '../entities/BudgetProject'
import type { BudgetItem } from '../entities/BudgetItem'
import type { BudgetQuote } from '../entities/BudgetQuote'
import type { Transaction } from '../entities/Transaction'

export function linkedProjectExpenses(projectId: string, transactions: Transaction[]): Transaction[] {
  return transactions.filter((entry) => entry.kind === 'expense' && entry.budgetProjectId === projectId)
}

export function itemSummary(item: BudgetItem, quotes: BudgetQuote[], transactions: Transaction[]) {
  const itemQuotes = quotes.filter((quote) => quote.itemId === item.id)
  const chosen = itemQuotes.find((quote) => quote.selected)
  const lowest = itemQuotes.length ? Math.min(...itemQuotes.map((quote) => quote.amountCents)) : null
  const spentCents = transactions.filter((entry) =>
    entry.kind === 'expense' && entry.budgetProjectId === item.projectId && entry.budgetItemId === item.id,
  ).reduce((sum, entry) => sum + entry.amountCents, 0)

  return {
    quotes: itemQuotes,
    selectedQuote: chosen ?? null,
    cheapestCents: lowest,
    plannedCents: item.plannedCents,
    approvedCents: chosen?.amountCents ?? null,
    spentCents,
  }
}

export function budgetProjectSummary(project: BudgetProject, items: BudgetItem[], quotes: BudgetQuote[], transactions: Transaction[]) {
  const included = items.filter((item) => item.projectId === project.id)
  const approvedCents = included.reduce((sum, item) => sum + (itemSummary(item, quotes, transactions).approvedCents ?? 0), 0)
  const approvedItems = included.filter((item) => itemSummary(item, quotes, transactions).selectedQuote !== null).length
  const spentCents = linkedProjectExpenses(project.id, transactions).reduce((sum, entry) => sum + entry.amountCents, 0)
  const plannedItemsCents = included.reduce((sum, item) => sum + (item.plannedCents ?? 0), 0)
  const usedPercent = project.targetCents ? spentCents / project.targetCents * 100 : null
  return {
    targetCents: project.targetCents,
    plannedItemsCents,
    approvedCents,
    approvedItems,
    itemCount: included.length,
    spentCents,
    remainingCents: project.targetCents - spentCents,
    comparedToApprovedCents: approvedCents - project.targetCents,
    usedPercent,
  }
}
