import { describe, expect, it } from 'vitest'
import { expenseOverviewForMonth } from '../src/domain/services/expenseOverview'
import { monthlyExpenseDetails } from '../src/domain/services/monthlyExpenseDetails'
import type { RecurringBill } from '../src/domain/entities/RecurringBill'
import type { MonthlyBillEntry } from '../src/domain/entities/MonthlyBillEntry'
import type { FixedExpense } from '../src/domain/entities/FixedExpense'
import type { Transaction } from '../src/domain/entities/Transaction'

const bills: RecurringBill[] = [
  { id: 'luz', name: 'Energia', dueDay: 12, active: true, createdAt: '' },
  { id: 'agua', name: 'Água', dueDay: 6, active: false, createdAt: '' },
]
const entries: MonthlyBillEntry[] = [
  { id: 'b1', billId: 'luz', yearMonth: '2026-09', amountCents: 19500, status: 'paid', paidAt: '2026-09-12' },
  { id: 'b2', billId: 'agua', yearMonth: '2026-09', amountCents: 6500, status: 'pending', paidAt: null },
  { id: 'b3', billId: 'luz', yearMonth: '2026-08', amountCents: 18000, status: 'paid', paidAt: null },
]
const fixed: FixedExpense[] = [
  { id: 'f1', name: 'Aluguel', amountCents: 140000, dueDay: 10, startMonth: '2026-07', endBeforeMonth: null, paidMonths: ['2026-09'], createdAt: '' },
  { id: 'f2', name: 'Streaming', amountCents: 4000, dueDay: 20, startMonth: '2026-08', endBeforeMonth: '2026-10', paidMonths: [], createdAt: '' },
  { id: 'f3', name: 'Antigo', amountCents: 5500, dueDay: 2, startMonth: '2026-01', endBeforeMonth: '2026-09', paidMonths: [], createdAt: '' },
]
const transactions: Transaction[] = [
  { id: 't1', description: 'Mercado', amountCents: 9000, category: 'Alimentação', kind: 'expense', occurredOn: '2026-09-19', createdAt: '' },
  { id: 't2', description: 'Cinema', amountCents: 5000, category: 'Lazer', kind: 'expense', occurredOn: '2026-09-05', createdAt: '' },
  { id: 't3', description: 'Salário', amountCents: 200000, category: 'Renda', kind: 'income', occurredOn: '2026-09-01', createdAt: '' },
  { id: 't4', description: 'Outro mês', amountCents: 1200, category: 'Mercado', kind: 'expense', occurredOn: '2026-08-20', createdAt: '' },
]

describe('Detalhes ao clicar na barra do relatório', () => {
  it('lista somente as despesas do mês, preservando contas arquivadas e status', () => {
    const groups = monthlyExpenseDetails(bills, entries, fixed, transactions, '2026-09')
    expect(groups.map((group) => group.type)).toEqual(['recurring', 'fixed', 'oneoff'])
    expect(groups.map((group) => group.totalCents)).toEqual([26000, 144000, 14000])
    expect(groups[0].items.map((item) => item.name)).toEqual(['Água', 'Energia'])
    expect(groups[0].items.map((item) => item.status)).toEqual(['pending', 'paid'])
    expect(groups[1].items.map((item) => item.name)).toEqual(['Aluguel', 'Streaming'])
    expect(groups[1].items.map((item) => item.status)).toEqual(['paid', 'pending'])
    expect(groups[2].items.map((item) => item.name)).toEqual(['Mercado', 'Cinema'])
    expect(groups[2].items.every((item) => item.status === 'recorded')).toBe(true)
    expect(groups.flatMap((group) => group.items).some((item) => item.name === 'Salário')).toBe(false)
  })

  it('reconcilia o detalhamento com os valores do gráfico para todos os meses', () => {
    for (const period of ['2026-08', '2026-09', '2026-10', '2026-11']) {
      const groups = monthlyExpenseDetails(bills, entries, fixed, transactions, period)
      const overview = expenseOverviewForMonth(entries, transactions, period, fixed)
      expect(groups[0].totalCents).toBe(overview.recurringCents)
      expect(groups[1].totalCents).toBe(overview.fixedCents)
      expect(groups[2].totalCents).toBe(overview.oneOffCents)
      expect(groups.reduce((total, group) => total + group.totalCents, 0)).toBe(overview.totalCents)
    }
  })

  it('mostra mês sem gastos e respeita término de gastos fixos', () => {
    const empty = monthlyExpenseDetails(bills, entries, fixed, transactions, '2025-12')
    expect(empty.every((section) => section.items.length === 0 && section.totalCents === 0)).toBe(true)
    const ended = monthlyExpenseDetails(bills, entries, fixed, transactions, '2026-10')
    expect(ended[1].items.map((item) => item.name)).toEqual(['Aluguel'])
  })
})
