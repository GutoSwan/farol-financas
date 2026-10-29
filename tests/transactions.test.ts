import { describe, expect, it, beforeEach } from 'vitest'
import { saveTransaction } from '../src/application/use-cases/saveTransaction'
import { BrowserTransactionRepository } from '../src/infrastructure/persistence/BrowserTransactionRepository'
import { expensesByCategory, transactionSummary, transactionsInMonth } from '../src/domain/services/transactionAnalytics'

const data = new Map<string, string>()
beforeEach(() => {
  data.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value) },
    },
  })
})

describe('Lançamentos avulsos', () => {
  it('registra compra de mercado por R$ 90,00', () => {
    const repository = new BrowserTransactionRepository('household-default')
    saveTransaction(repository, { description: 'Compra mercado', amountCents: 9000, category: 'Mercado', kind: 'expense', occurredOn: '2026-10-29' })
    expect(repository.list()[0].amountCents).toBe(9000)
    expect(transactionSummary(repository.list()).expensesCents).toBe(9000)
  })
  it('separa lançamentos de espaços diferentes', () => {
    const house = new BrowserTransactionRepository('household-default')
    const friend = new BrowserTransactionRepository('another-workspace')
    saveTransaction(house, { description: 'Mercado', amountCents: 9000, category: 'Mercado', kind: 'expense', occurredOn: '2026-10-29' })
    expect(friend.list()).toHaveLength(0)
  })
  it('permite edição e exclusão, sem duplicar', () => {
    const repo = new BrowserTransactionRepository('household-default')
    const tx = saveTransaction(repo, { description: 'Mercado', amountCents: 9000, category: 'Mercado', kind: 'expense', occurredOn: '2026-10-29' })
    saveTransaction(repo, { id: tx.id, description: 'Mercado e padaria', amountCents: 9500, category: 'Mercado', kind: 'expense', occurredOn: '2026-10-29' })
    expect(repo.list()).toHaveLength(1)
    expect(repo.list()[0].amountCents).toBe(9500)
    repo.delete(tx.id)
    expect(repo.list()).toHaveLength(0)
  })
  it('filtra por mês e agrupa por categoria', () => {
    const repo = new BrowserTransactionRepository('household-default')
    saveTransaction(repo, { description: 'Mercado', amountCents: 9000, category: 'Mercado', kind: 'expense', occurredOn: '2026-10-29' })
    saveTransaction(repo, { description: 'Combustível', amountCents: 5000, category: 'Transporte', kind: 'expense', occurredOn: '2026-10-28' })
    saveTransaction(repo, { description: 'Salário', amountCents: 150000, category: 'Salário', kind: 'income', occurredOn: '2026-09-30' })
    expect(transactionsInMonth(repo.list(), '2026-10')).toHaveLength(2)
    expect(expensesByCategory(repo.list())).toHaveLength(2)
  })
  it('impede valor negativo ou data inválida', () => {
    const repo = new BrowserTransactionRepository('household-default')
    expect(() => saveTransaction(repo, { description: 'Mercado', amountCents: -100, category: 'Mercado', kind: 'expense', occurredOn: '2026-10-29' })).toThrow()
    expect(() => saveTransaction(repo, { description: 'Mercado', amountCents: 100, category: 'Mercado', kind: 'expense', occurredOn: '2026-02-31' })).toThrow()
  })
})

describe('Categorias personalizadas', () => {
  it('permite uma categoria criada pelo usuário', () => {
    const repo = new BrowserTransactionRepository('household-default')
    const entry = saveTransaction(repo, {
      description: 'Ração de cachorro',
      amountCents: 9000,
      category: 'Pets',
      kind: 'expense',
      occurredOn: '2026-10-29',
    })
    expect(entry.category).toBe('Pets')
    expect(expensesByCategory(repo.list())).toEqual([{ category: 'Pets', amountCents: 9000 }])
  })

  it('reaproveita a grafia de uma categoria existente', () => {
    const repo = new BrowserTransactionRepository('household-default')
    saveTransaction(repo, { description: 'Primeira compra', amountCents: 1000, category: 'Mercado', kind: 'expense', occurredOn: '2026-10-29' })
    const next = saveTransaction(repo, { description: 'Segunda compra', amountCents: 2000, category: 'mercado', kind: 'expense', occurredOn: '2026-10-29' })
    expect(next.category).toBe('Mercado')
    expect(expensesByCategory(repo.list())).toEqual([{ category: 'Mercado', amountCents: 3000 }])
  })

  it('recusa uma categoria vazia', () => {
    const repo = new BrowserTransactionRepository('household-default')
    expect(() => saveTransaction(repo, { description: 'Compra mercado', amountCents: 9000, category: ' ', kind: 'expense', occurredOn: '2026-10-29' })).toThrow()
  })
})
