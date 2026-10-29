import { beforeEach, describe, expect, it } from 'vitest'
import { BrowserBillRepository } from '../src/infrastructure/persistence/BrowserBillRepository'
import { deleteMonthlyBillEntry } from '../src/application/use-cases/deleteMonthlyBillEntry'
import { expenseOverviewForMonth } from '../src/domain/services/expenseOverview'

const data = new Map<string, string>()
beforeEach(() => {
  data.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } },
  })
})

describe('Exclusão do histórico mensal', () => {
  it('remove somente o mês escolhido, preservando o cadastro e os outros meses', () => {
    const repo = new BrowserBillRepository('household-default')
    repo.saveBill({ id: 'energia', name: 'Energia', dueDay: 10, active: true, createdAt: '2026-10-01' })
    repo.upsertEntry({ id: 'set', billId: 'energia', yearMonth: '2026-09', amountCents: 18000, status: 'paid', paidAt: '2026-09-10' })
    repo.upsertEntry({ id: 'out', billId: 'energia', yearMonth: '2026-10', amountCents: 20000, status: 'paid', paidAt: '2026-10-10' })
    expect(expenseOverviewForMonth(repo.listEntries(), [], '2026-10').totalCents).toBe(20000)
    deleteMonthlyBillEntry(repo, 'out')
    expect(repo.listBills()).toHaveLength(1)
    expect(repo.listEntries()).toHaveLength(1)
    expect(repo.listEntries()[0].yearMonth).toBe('2026-09')
    expect(expenseOverviewForMonth(repo.listEntries(), [], '2026-10').totalCents).toBe(0)
  })

  it('não apaga registros dos outros espaços e rejeita exclusão inexistente', () => {
    const home = new BrowserBillRepository('household-default')
    const friend = new BrowserBillRepository('friend-123')
    friend.upsertEntry({ id: 'a', billId: 'energia', yearMonth: '2026-10', amountCents: 1000, status: 'paid', paidAt: '2026-10-10' })
    expect(() => deleteMonthlyBillEntry(home, 'a')).toThrow()
    expect(friend.listEntries()).toHaveLength(1)
  })
})
