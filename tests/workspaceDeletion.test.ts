import { beforeEach, describe, expect, it } from 'vitest'
import { BrowserWorkspaceRepository } from '../src/infrastructure/persistence/BrowserWorkspaceRepository'
import { BrowserBillRepository } from '../src/infrastructure/persistence/BrowserBillRepository'
import { BrowserFixedExpenseRepository } from '../src/infrastructure/persistence/BrowserFixedExpenseRepository'
import { BrowserTransactionRepository } from '../src/infrastructure/persistence/BrowserTransactionRepository'
import { createFixedExpense } from '../src/application/use-cases/manageFixedExpense'
import { saveTransaction } from '../src/application/use-cases/saveTransaction'
import { DEFAULT_WORKSPACE_ID } from '../src/domain/entities/FinancialWorkspace'

const data = new Map<string, string>()
beforeEach(() => {
  data.clear()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  } })
})

describe('Exclusão de espaço financeiro', () => {
  it('remove os três módulos do espaço escolhido sem tocar nos outros', () => {
    const spaces = new BrowserWorkspaceRepository()
    const friend = spaces.create('Espaço amigo')
    const bills = new BrowserBillRepository(friend.id)
    const fixed = new BrowserFixedExpenseRepository(friend.id)
    const expenses = new BrowserTransactionRepository(friend.id)
    bills.saveBill({ id: 'luz', name: 'Energia', dueDay: 10, active: true, createdAt: '' })
    createFixedExpense(fixed, { name: 'Aluguel', amountCents: 100000, dueDay: 10, startMonth: '2026-10' })
    saveTransaction(expenses, { description: 'Mercado', amountCents: 3000, kind: 'expense', category: 'Mercado', occurredOn: '2026-10-29' })

    const home = new BrowserBillRepository(DEFAULT_WORKSPACE_ID)
    home.saveBill({ id: 'agua', name: 'Água', dueDay: 11, active: true, createdAt: '' })
    spaces.select(friend.id)
    spaces.delete(friend.id)

    expect(spaces.getActiveId()).toBe(DEFAULT_WORKSPACE_ID)
    expect(spaces.list()).toHaveLength(1)
    expect(bills.listBills()).toHaveLength(0)
    expect(fixed.list()).toHaveLength(0)
    expect(expenses.list()).toHaveLength(0)
    expect(home.listBills()).toHaveLength(1)
  })

  it('não permite apagar o espaço inicial', () => {
    const repo = new BrowserWorkspaceRepository()
    expect(() => repo.delete(DEFAULT_WORKSPACE_ID)).toThrow()
    expect(repo.list()).toHaveLength(1)
  })

  it('não permite apagar um espaço inexistente', () => {
    const repo = new BrowserWorkspaceRepository()
    expect(() => repo.delete('not-found')).toThrow()
  })
})
