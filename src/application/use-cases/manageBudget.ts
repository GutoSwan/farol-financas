import type { BudgetRepository, BudgetSnapshot } from '../../domain/repositories/BudgetRepository'
import type { BudgetProject, BudgetProjectStatus } from '../../domain/entities/BudgetProject'
import type { BudgetItem } from '../../domain/entities/BudgetItem'
import type { BudgetQuote } from '../../domain/entities/BudgetQuote'
import { assertMoney } from '../../domain/value-objects/Money'

function name(value: string, label: string, max = 120): string {
  const result = value.trim().replace(/\s+/g, ' ')
  if (result.length < 2 || result.length > max) throw new Error(`${label} deve ter de 2 a ${max} caracteres.`)
  return result
}
function verifyProject(snapshot: BudgetSnapshot, id: string): BudgetProject {
  const found = snapshot.projects.find((project) => project.id === id)
  if (!found) throw new Error('Projeto não encontrado.')
  return found
}
function verifyItem(snapshot: BudgetSnapshot, id: string): BudgetItem {
  const found = snapshot.items.find((item) => item.id === id)
  if (!found) throw new Error('Item do orçamento não encontrado.')
  return found
}

export function createBudgetProject(repo: BudgetRepository, data: { title: string; category: string; targetCents: number; notes?: string }): BudgetProject {
  const snapshot = repo.read()
  const title = name(data.title, 'Nome do projeto')
  const category = name(data.category, 'Categoria', 40)
  assertMoney(data.targetCents)
  if (data.targetCents === 0) throw new Error('Informe um valor planejado acima de zero.')
  const project: BudgetProject = {
    id: crypto.randomUUID(), title, category, targetCents: data.targetCents,
    status: 'planning', notes: (data.notes ?? '').trim().slice(0, 500), createdAt: new Date().toISOString(),
  }
  snapshot.projects.push(project)
  repo.save(snapshot)
  return project
}

export function editBudgetProject(repo: BudgetRepository, id: string, data: { title: string; category: string; targetCents: number; notes: string; status: BudgetProjectStatus }): void {
  const snapshot = repo.read()
  const project = verifyProject(snapshot, id)
  const title = name(data.title, 'Nome do projeto')
  const category = name(data.category, 'Categoria', 40)
  assertMoney(data.targetCents)
  if (data.targetCents === 0) throw new Error('Informe um valor planejado acima de zero.')
  if (!['planning','quoting','approved','in-progress','completed'].includes(data.status)) throw new Error('Status inválido.')
  Object.assign(project, { title, category, targetCents: data.targetCents, notes: data.notes.trim().slice(0, 500), status: data.status })
  repo.save(snapshot)
}

export function addBudgetItem(repo: BudgetRepository, projectId: string, titleInput: string, plannedCents: number | null): BudgetItem {
  const snapshot = repo.read()
  verifyProject(snapshot, projectId)
  const title = name(titleInput, 'Nome do item')
  if (plannedCents !== null) assertMoney(plannedCents)
  const item: BudgetItem = { id: crypto.randomUUID(), projectId, title, plannedCents, createdAt: new Date().toISOString() }
  snapshot.items.push(item)
  repo.save(snapshot)
  return item
}

export function editBudgetItem(repo: BudgetRepository, itemId: string, titleInput: string, plannedCents: number | null): void {
  const snapshot = repo.read()
  const item = verifyItem(snapshot, itemId)
  const title = name(titleInput, 'Nome do item')
  if (plannedCents !== null) assertMoney(plannedCents)
  Object.assign(item, { title, plannedCents })
  repo.save(snapshot)
}

export function addBudgetQuote(repo: BudgetRepository, input: {
  itemId: string; provider: string; amountCents: number; estimatedDays: number | null; materialsIncluded: boolean; notes?: string
}): BudgetQuote {
  const snapshot = repo.read()
  verifyItem(snapshot, input.itemId)
  const provider = name(input.provider, 'Profissional ou loja')
  assertMoney(input.amountCents)
  if (!input.amountCents) throw new Error('A proposta precisa ter um valor maior que zero.')
  if (input.estimatedDays !== null &&
    (!Number.isInteger(input.estimatedDays) || input.estimatedDays < 1 || input.estimatedDays > 3650)) {
    throw new Error('Prazo estimado inválido.')
  }
  const quote: BudgetQuote = {
    id: crypto.randomUUID(), itemId: input.itemId, provider, amountCents: input.amountCents,
    estimatedDays: input.estimatedDays, materialsIncluded: input.materialsIncluded,
    notes: (input.notes ?? '').trim().slice(0, 500), selected: false, createdAt: new Date().toISOString(),
  }
  snapshot.quotes.push(quote)
  repo.save(snapshot)
  return quote
}

/** Uma proposta selecionada por item. Voltar a null deixa todas sem seleção. */
export function selectBudgetQuote(repo: BudgetRepository, itemId: string, quoteId: string | null): void {
  const snapshot = repo.read()
  verifyItem(snapshot, itemId)
  if (quoteId && !snapshot.quotes.some((quote) => quote.id === quoteId && quote.itemId === itemId)) {
    throw new Error('Proposta não pertence ao item selecionado.')
  }
  for (const quote of snapshot.quotes) {
    if (quote.itemId === itemId) quote.selected = quote.id === quoteId
  }
  repo.save(snapshot)
}

export function deleteBudgetQuote(repo: BudgetRepository, quoteId: string): void {
  const snapshot = repo.read()
  if (!snapshot.quotes.some((quote) => quote.id === quoteId)) throw new Error('Proposta não encontrada.')
  snapshot.quotes = snapshot.quotes.filter((quote) => quote.id !== quoteId)
  repo.save(snapshot)
}
