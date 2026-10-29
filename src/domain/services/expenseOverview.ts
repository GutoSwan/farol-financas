import type { MonthlyBillEntry } from '../entities/MonthlyBillEntry'
import type { Transaction } from '../entities/Transaction'
import type { FixedExpense } from '../entities/FixedExpense'
import { totalForMonth, paidForMonth } from './billAnalytics'
import { transactionsInMonth, transactionSummary } from './transactionAnalytics'
import { fixedExpenseSummary } from './fixedExpenseAnalytics'

/**
 * Total COMPROMETIDO, não dinheiro efetivamente pago.
 * Cada categoria de lançamento deve ser registrada em um único módulo.
 */
export function expenseOverviewForMonth(
  bills: MonthlyBillEntry[],
  transactions: Transaction[],
  month: string,
  fixedExpenses: FixedExpense[] = [],
) {
  const recurringCents = totalForMonth(bills, month)
  const paidRecurringCents = paidForMonth(bills, month)
  const pendingRecurringCents = recurringCents - paidRecurringCents
  const oneOffCents = transactionSummary(transactionsInMonth(transactions, month)).expensesCents
  const fixed = fixedExpenseSummary(fixedExpenses, month)
  return {
    recurringCents,
    paidRecurringCents,
    pendingRecurringCents,
    oneOffCents,
    fixedCents: fixed.totalCents,
    fixedPaidCents: fixed.paidCents,
    fixedPendingCents: fixed.pendingCents,
    totalCents: recurringCents + oneOffCents + fixed.totalCents,
  }
}
