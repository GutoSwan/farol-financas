import type { FixedExpense } from '../entities/FixedExpense'

export function validMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}
export function nextMonth(month: string): string {
  if (!validMonth(month)) throw new Error('Mês inválido.')
  const [year, currentMonth] = month.split('-').map(Number)
  const date = new Date(year, currentMonth, 1)
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')
}

export function fixedExpensesForMonth(items: FixedExpense[], month: string): FixedExpense[] {
  if (!validMonth(month)) return []
  return items.filter((item) => item.startMonth <= month && (!item.endBeforeMonth || month < item.endBeforeMonth))
}

export function fixedExpenseSummary(items: FixedExpense[], month: string) {
  const monthly = fixedExpensesForMonth(items, month)
  return {
    count: monthly.length,
    totalCents: monthly.reduce((sum, item) => sum + item.amountCents, 0),
    paidCents: monthly.filter((item) => item.paidMonths.includes(month)).reduce((sum, item) => sum + item.amountCents, 0),
    pendingCents: monthly.filter((item) => !item.paidMonths.includes(month)).reduce((sum, item) => sum + item.amountCents, 0),
  }
}
