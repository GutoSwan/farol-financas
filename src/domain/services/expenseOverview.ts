import type { MonthlyBillEntry } from '../entities/MonthlyBillEntry'
import type { Transaction } from '../entities/Transaction'
import { totalForMonth, paidForMonth } from './billAnalytics'
import { transactionsInMonth, transactionSummary } from './transactionAnalytics'

/**
 * Total de despesas REGISTRADAS no mês, não somente pagamentos efetuados.
 * Contas pendentes entram no total (comprometimento), receitas ficam fora.
 *
 * A mesma conta não deve ser cadastrada também como lançamento avulso.
 */
export function expenseOverviewForMonth(
  bills: MonthlyBillEntry[],
  transactions: Transaction[],
  month: string,
) {
  const recurringCents = totalForMonth(bills, month)
  const paidRecurringCents = paidForMonth(bills, month)
  const pendingRecurringCents = recurringCents - paidRecurringCents
  const oneOffCents = transactionSummary(transactionsInMonth(transactions, month)).expensesCents
  return {
    recurringCents,
    paidRecurringCents,
    pendingRecurringCents,
    oneOffCents,
    totalCents: recurringCents + oneOffCents,
  }
}
