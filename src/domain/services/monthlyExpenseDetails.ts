import type { RecurringBill } from '../entities/RecurringBill'
import type { MonthlyBillEntry } from '../entities/MonthlyBillEntry'
import type { FixedExpense } from '../entities/FixedExpense'
import type { Transaction } from '../entities/Transaction'
import { fixedExpensesForMonth } from './fixedExpenseAnalytics'
import { transactionsInMonth } from './transactionAnalytics'

export type MonthlyExpenseType = 'all' | 'recurring' | 'fixed' | 'oneoff'
export type ExpenseSource = Exclude<MonthlyExpenseType, 'all'>
export type ExpenseStatus = 'paid' | 'pending' | 'recorded'

export interface MonthlyExpenseItem {
  id: string
  name: string
  description: string
  amountCents: number
  status: ExpenseStatus
}

export interface MonthlyExpenseGroup {
  type: ExpenseSource
  title: string
  items: MonthlyExpenseItem[]
  totalCents: number
}

/** As mesmas origens usadas no gráfico. Sem duplicar pagamentos ou incluir receitas. */
export function monthlyExpenseDetails(
  bills: RecurringBill[],
  entries: MonthlyBillEntry[],
  fixedExpenses: FixedExpense[],
  transactions: Transaction[],
  month: string,
): MonthlyExpenseGroup[] {
  const names = new Map(bills.map((bill) => [bill.id, bill]))
  const monthlyBills = entries
    .filter((entry) => entry.yearMonth === month)
    .map((entry) => {
      const bill = names.get(entry.billId)
      return {
        order: bill?.dueDay ?? 32,
        item: {
          id: entry.id,
          name: bill?.name ?? 'Conta mensal sem cadastro',
          description: bill ? `Vencimento: dia ${bill.dueDay}` : 'Registro mensal preservado',
          amountCents: entry.amountCents,
          status: entry.status,
        } satisfies MonthlyExpenseItem,
      }
    })
    .sort((a, b) => a.order - b.order || a.item.name.localeCompare(b.item.name, 'pt-BR'))
    .map(({ item }) => item)

  const monthlyFixed = fixedExpensesForMonth(fixedExpenses, month)
    .map((expense) => ({
      id: expense.id,
      name: expense.name,
      description: `Vencimento: dia ${expense.dueDay} · cobrança recorrente`,
      amountCents: expense.amountCents,
      status: expense.paidMonths.includes(month) ? 'paid' as const : 'pending' as const,
      dueDay: expense.dueDay,
    }))
    .sort((a, b) => a.dueDay - b.dueDay || a.name.localeCompare(b.name, 'pt-BR'))
    .map(({ dueDay: _dueDay, ...item }) => item satisfies MonthlyExpenseItem)

  const monthlyTransactions = transactionsInMonth(transactions, month)
    .filter((transaction) => transaction.kind === 'expense')
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || a.description.localeCompare(b.description, 'pt-BR'))
    .map((transaction) => ({
      id: transaction.id,
      name: transaction.description,
      description: `${transaction.category} · ${transaction.occurredOn.slice(8, 10)}/${transaction.occurredOn.slice(5, 7)}/${transaction.occurredOn.slice(0, 4)}`,
      amountCents: transaction.amountCents,
      status: 'recorded' as const,
    }))

  const sections: Array<{ type: ExpenseSource; title: string; items: MonthlyExpenseItem[] }> = [
    { type: 'recurring', title: 'Contas mensais', items: monthlyBills },
    { type: 'fixed', title: 'Gastos fixos', items: monthlyFixed },
    { type: 'oneoff', title: 'Despesas avulsas', items: monthlyTransactions },
  ]

  return sections.map((section) => ({
    ...section,
    totalCents: section.items.reduce((total, item) => total + item.amountCents, 0),
  }))
}
