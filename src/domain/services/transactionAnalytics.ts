import type { Transaction, TransactionCategory } from '../entities/Transaction'

export function transactionsInMonth(entries: Transaction[], month: string): Transaction[] {
  return entries.filter((item) => item.occurredOn.slice(0, 7) === month)
}

export function transactionSummary(entries: Transaction[]) {
  const expensesCents = entries
    .filter((entry) => entry.kind === 'expense')
    .reduce((sum, entry) => sum + entry.amountCents, 0)
  const incomeCents = entries
    .filter((entry) => entry.kind === 'income')
    .reduce((sum, entry) => sum + entry.amountCents, 0)
  return { expensesCents, incomeCents, netCents: incomeCents - expensesCents }
}

export function expensesByCategory(entries: Transaction[]): { category: TransactionCategory; amountCents: number }[] {
  const groups = new Map<TransactionCategory, number>()
  for (const entry of entries) {
    if (entry.kind !== 'expense') continue
    groups.set(entry.category, (groups.get(entry.category) ?? 0) + entry.amountCents)
  }
  return Array.from(groups, ([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents)
}
