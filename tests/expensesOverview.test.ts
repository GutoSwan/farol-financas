import { describe, expect, it } from 'vitest'
import { expenseOverviewForMonth } from '../src/domain/services/expenseOverview'
import type { MonthlyBillEntry } from '../src/domain/entities/MonthlyBillEntry'
import type { Transaction } from '../src/domain/entities/Transaction'

const bills: MonthlyBillEntry[] = [
  { id: 'b1', billId: 'luz', yearMonth: '2026-10', amountCents: 21000, status: 'paid', paidAt: '2026-10-10' },
  { id: 'b2', billId: 'agua', yearMonth: '2026-10', amountCents: 8000, status: 'pending', paidAt: null },
  { id: 'b3', billId: 'luz', yearMonth: '2026-09', amountCents: 19000, status: 'paid', paidAt: '2026-09-10' },
]
const transactions: Transaction[] = [
  { id: 't1', description: 'Compra mercado', amountCents: 9000, category: 'Mercado', kind: 'expense', occurredOn: '2026-10-29', createdAt: '' },
  { id: 't2', description: 'Salário', amountCents: 400000, category: 'Salário', kind: 'income', occurredOn: '2026-10-01', createdAt: '' },
  { id: 't3', description: 'Farmácia', amountCents: 3000, category: 'Saúde', kind: 'expense', occurredOn: '2026-09-05', createdAt: '' },
]

describe('Visão geral de gastos', () => {
  it('soma gastos avulsos e contas mensais, inclusive pendentes', () => {
    expect(expenseOverviewForMonth(bills, transactions, '2026-10')).toEqual({
      recurringCents: 29000,
      paidRecurringCents: 21000,
      pendingRecurringCents: 8000,
      oneOffCents: 9000,
      totalCents: 38000,
    })
  })
  it('não inclui receitas no total nem mistura os meses', () => {
    expect(expenseOverviewForMonth(bills, transactions, '2026-09').totalCents).toBe(22000)
    expect(expenseOverviewForMonth(bills, transactions, '2026-11').totalCents).toBe(0)
  })
})
