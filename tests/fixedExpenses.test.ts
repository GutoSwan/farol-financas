import { beforeEach, describe, expect, it } from 'vitest'
import { BrowserFixedExpenseRepository } from '../src/infrastructure/persistence/BrowserFixedExpenseRepository'
import { createFixedExpense, endFixedExpenseAfterMonth, setFixedExpensePaid } from '../src/application/use-cases/manageFixedExpense'
import { fixedExpenseSummary, nextMonth } from '../src/domain/services/fixedExpenseAnalytics'
import { expenseOverviewForMonth } from '../src/domain/services/expenseOverview'

const data = new Map<string, string>()
beforeEach(() => {
  data.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } },
  })
})

describe('Gastos fixos', () => {
  it('se repete desde o mês inicial e separa espaços', () => {
    const house = new BrowserFixedExpenseRepository('household-default')
    const friend = new BrowserFixedExpenseRepository('another-space')
    createFixedExpense(house, { name: 'Aluguel', amountCents: 150000, dueDay: 10, startMonth: '2026-10' })
    expect(fixedExpenseSummary(house.list(), '2026-09').totalCents).toBe(0)
    expect(fixedExpenseSummary(house.list(), '2026-10').totalCents).toBe(150000)
    expect(fixedExpenseSummary(house.list(), '2026-11').totalCents).toBe(150000)
    expect(fixedExpenseSummary(friend.list(), '2026-10').totalCents).toBe(0)
  })

  it('marcar pago não aumenta nem duplica o total financeiro', () => {
    const repository = new BrowserFixedExpenseRepository('household-default')
    const item = createFixedExpense(repository, { name: 'Netflix', amountCents: 4000, dueDay: 12, startMonth: '2026-10' })
    expect(fixedExpenseSummary(repository.list(), '2026-10').pendingCents).toBe(4000)
    setFixedExpensePaid(repository, item.id, '2026-10', true)
    setFixedExpensePaid(repository, item.id, '2026-10', true)
    expect(fixedExpenseSummary(repository.list(), '2026-10').paidCents).toBe(4000)
    expect(expenseOverviewForMonth([], [], '2026-10', repository.list()).totalCents).toBe(4000)
    expect(fixedExpenseSummary(repository.list(), '2026-11').pendingCents).toBe(4000)
    setFixedExpensePaid(repository, item.id, '2026-10', false)
    expect(fixedExpenseSummary(repository.list(), '2026-10').pendingCents).toBe(4000)
  })

  it('encerrar não apaga meses históricos', () => {
    const repository = new BrowserFixedExpenseRepository('household-default')
    const item = createFixedExpense(repository, { name: 'Academia', amountCents: 9900, dueDay: 5, startMonth: '2026-10' })
    endFixedExpenseAfterMonth(repository, item.id, '2026-11')
    expect(nextMonth('2026-12')).toBe('2027-01')
    expect(fixedExpenseSummary(repository.list(), '2026-10').totalCents).toBe(9900)
    expect(fixedExpenseSummary(repository.list(), '2026-11').totalCents).toBe(9900)
    expect(fixedExpenseSummary(repository.list(), '2026-12').totalCents).toBe(0)
  })

  it('valida valores e datas da recorrência', () => {
    const repository = new BrowserFixedExpenseRepository('household-default')
    expect(() => createFixedExpense(repository, { name: 'TV', amountCents: -100, dueDay: 10, startMonth: '2026-10' })).toThrow()
    expect(() => createFixedExpense(repository, { name: 'TV', amountCents: 100, dueDay: 32, startMonth: '2026-10' })).toThrow()
    expect(() => createFixedExpense(repository, { name: 'TV', amountCents: 100, dueDay: 10, startMonth: '2026-13' })).toThrow()
  })
})
