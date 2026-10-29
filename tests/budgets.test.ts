import { beforeEach, describe, expect, it } from 'vitest'
import { BrowserBudgetRepository } from '../src/infrastructure/persistence/BrowserBudgetRepository'
import { BrowserTransactionRepository } from '../src/infrastructure/persistence/BrowserTransactionRepository'
import { BrowserWorkspaceRepository } from '../src/infrastructure/persistence/BrowserWorkspaceRepository'
import {
  createBudgetProject, editBudgetProject, addBudgetItem, editBudgetItem,
  addBudgetQuote, selectBudgetQuote, deleteBudgetQuote,
} from '../src/application/use-cases/manageBudget'
import { budgetProjectSummary, itemSummary } from '../src/domain/services/budgetAnalytics'
import { saveTransaction } from '../src/application/use-cases/saveTransaction'
import { expenseOverviewForMonth } from '../src/domain/services/expenseOverview'

const data = new Map<string, string>()
beforeEach(() => {
  data.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value) },
      removeItem: (key: string) => { data.delete(key) },
    },
  })
})

function sample() {
  const repo = new BrowserBudgetRepository('household-default')
  const project = createBudgetProject(repo, {
    title: 'Reforma do banheiro', category: 'Reforma', targetCents: 300000, notes: 'Piso novo',
  })
  const item = addBudgetItem(repo, project.id, 'Mão de obra do pedreiro', 300000)
  const first = addBudgetQuote(repo, {
    itemId: item.id, provider: 'Pedreiro 1', amountCents: 350000,
    estimatedDays: 7, materialsIncluded: false, notes: 'Sem materiais',
  })
  const second = addBudgetQuote(repo, {
    itemId: item.id, provider: 'Pedreiro 2', amountCents: 270000,
    estimatedDays: 10, materialsIncluded: true, notes: 'Inclui rodapé',
  })
  return { repo, project, item, first, second }
}

describe('Projetos de orçamento e cotações', () => {
  it('permite comparar duas propostas e escolher somente uma para cada item', () => {
    const { repo, project, item, first, second } = sample()
    let summary = itemSummary(item, repo.read().quotes, [])
    expect(summary.cheapestCents).toBe(270000)
    expect(summary.selectedQuote).toBeNull()
    selectBudgetQuote(repo, item.id, first.id)
    selectBudgetQuote(repo, item.id, second.id)
    summary = itemSummary(item, repo.read().quotes, [])
    expect(summary.selectedQuote?.provider).toBe('Pedreiro 2')
    expect(repo.read().quotes.filter(q => q.selected)).toHaveLength(1)
    expect(budgetProjectSummary(project, repo.read().items, repo.read().quotes, []).approvedCents).toBe(270000)
    selectBudgetQuote(repo, item.id, null)
    expect(repo.read().quotes.every(q => !q.selected)).toBe(true)
  })

  it('somente pagamentos vinculados contam como gasto real, sem dupla contagem', () => {
    const { repo, project, item, second } = sample()
    selectBudgetQuote(repo, item.id, second.id)
    const transactions = new BrowserTransactionRepository('household-default')
    saveTransaction(transactions, {
      description: 'Entrada pedreiro', amountCents: 100000, category: 'Reforma',
      kind: 'expense', occurredOn: '2026-10-29', budgetProjectId: project.id, budgetItemId: item.id,
    })
    const overview = budgetProjectSummary(project, repo.read().items, repo.read().quotes, transactions.list())
    expect(overview.approvedCents).toBe(270000)
    expect(overview.spentCents).toBe(100000)
    expect(overview.remainingCents).toBe(200000)
    expect(expenseOverviewForMonth([], transactions.list(), '2026-10').totalCents).toBe(100000)
  })

  it('permite vincular uma compra antiga e desfazer sem mudar o gasto global', () => {
    const { repo, project, item } = sample()
    const transactions = new BrowserTransactionRepository('household-default')
    const original = saveTransaction(transactions, {
      description: 'Argamassa', amountCents: 35000, category: 'Reforma',
      kind: 'expense', occurredOn: '2026-10-29',
    })
    const linked = saveTransaction(transactions, {
      id: original.id, description: original.description, amountCents: original.amountCents,
      category: original.category, kind: 'expense', occurredOn: original.occurredOn,
      budgetProjectId: project.id, budgetItemId: item.id,
    })
    expect(transactions.list()).toHaveLength(1)
    expect(budgetProjectSummary(project, repo.read().items, repo.read().quotes, transactions.list()).spentCents).toBe(35000)
    saveTransaction(transactions, {
      id: linked.id, description: linked.description, amountCents: linked.amountCents,
      category: linked.category, kind: 'expense', occurredOn: linked.occurredOn,
      budgetProjectId: null, budgetItemId: null,
    })
    expect(budgetProjectSummary(project, repo.read().items, repo.read().quotes, transactions.list()).spentCents).toBe(0)
    expect(expenseOverviewForMonth([], transactions.list(), '2026-10').totalCents).toBe(35000)
  })

  it('isolamento por espaço e remoção dos orçamentos ao excluir espaço', () => {
    const spaces = new BrowserWorkspaceRepository()
    const friend = spaces.create('Amigo orçamento')
    const home = new BrowserBudgetRepository('household-default')
    const separate = new BrowserBudgetRepository(friend.id)
    createBudgetProject(home, { title: 'Reforma casa', category: 'Reforma', targetCents: 200000 })
    createBudgetProject(separate, { title: 'Reforma amigo', category: 'Reforma', targetCents: 150000 })
    expect(separate.read().projects).toHaveLength(1)
    spaces.delete(friend.id)
    expect(separate.read().projects).toHaveLength(0)
    expect(home.read().projects).toHaveLength(1)
  })

  it('permite editar projeto/item sem apagar propostas e rejeita relacionamentos inválidos', () => {
    const { repo, project, item, first } = sample()
    editBudgetProject(repo, project.id, {
      title: 'Reforma completa', category: 'Casa', targetCents: 400000,
      notes: 'Troca de pisos', status: 'quoting',
    })
    editBudgetItem(repo, item.id, 'Pedreiro e rodapé', 280000)
    expect(repo.read().projects[0].title).toBe('Reforma completa')
    expect(repo.read().items[0].plannedCents).toBe(280000)
    expect(repo.read().quotes).toHaveLength(2)
    expect(() => selectBudgetQuote(repo, item.id, 'inexistente')).toThrow()
    deleteBudgetQuote(repo, first.id)
    expect(repo.read().quotes).toHaveLength(1)
  })

  it('não admite preço negativo, projeto inexistente ou renda vinculada ao orçamento', () => {
    const { repo, project, item } = sample()
    expect(() => addBudgetItem(repo, 'inexistente', 'Piso', 10000)).toThrow()
    expect(() => addBudgetQuote(repo, {
      itemId: item.id, provider: 'Pedreiro 3', amountCents: -100,
      estimatedDays: null, materialsIncluded: false,
    })).toThrow()
    const transactions = new BrowserTransactionRepository('household-default')
    expect(() => saveTransaction(transactions, {
      description: 'Salário', amountCents: 200000, category: 'Salário', kind: 'income',
      occurredOn: '2026-10-29', budgetProjectId: project.id, budgetItemId: item.id,
    })).toThrow()
  })
})
