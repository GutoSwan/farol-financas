import type { Transaction } from '../entities/Transaction'

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

export function expensesByCategory(entries: Transaction[]): { category: string; amountCents: number }[] {
  const groups = new Map<string, { category: string; amountCents: number }>()
  for (const entry of entries) {
    if (entry.kind !== 'expense') continue
    const normalized = entry.category.trim().toLocaleLowerCase('pt-BR')
    const current = groups.get(normalized)
    if (current) current.amountCents += entry.amountCents
    else groups.set(normalized, { category: entry.category.trim(), amountCents: entry.amountCents })
  }
  return Array.from(groups.values()).sort((a, b) => b.amountCents - a.amountCents)
}
