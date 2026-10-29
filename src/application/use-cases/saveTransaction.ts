import type { TransactionRepository } from '../../domain/repositories/TransactionRepository'
import type { Transaction, TransactionCategory, TransactionKind } from '../../domain/entities/Transaction'
import { TRANSACTION_CATEGORIES } from '../../domain/entities/Transaction'
import { assertMoney } from '../../domain/value-objects/Money'

export interface TransactionInput {
  id?: string
  description: string
  amountCents: number
  category: TransactionCategory
  kind: TransactionKind
  occurredOn: string
  budgetProjectId?: string | null
  budgetItemId?: string | null


export function normalizeCategory(input: string, existingCategories: string[] = []): string {
  const normalized = input.trim().replace(/\s+/g, ' ')
  if (normalized.length < 2 || normalized.length > 40) {
    throw new Error('A categoria deve ter entre 2 e 40 caracteres.')
  }

  // Evita categorias duplicadas por diferença de maiúsculas e minúsculas.
  const known = [...TRANSACTION_CATEGORIES, ...existingCategories]
  return known.find((item) => item.toLocaleLowerCase('pt-BR') === normalized.toLocaleLowerCase('pt-BR')) ?? normalized
}

export function saveTransaction(repository: TransactionRepository, input: TransactionInput): Transaction {
  const description = input.description.trim()
  if (description.length < 2 || description.length > 120) throw new Error('Descrição deve ter de 2 a 120 caracteres.')
  assertMoney(input.amountCents)
  if (input.amountCents === 0) throw new Error('O valor precisa ser maior que zero.')
  const existing = repository.list()
  const category = normalizeCategory(input.category, existing.map((entry) => entry.category))
  if (input.kind !== 'expense' && input.kind !== 'income') throw new Error('Tipo de lançamento inválido.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) throw new Error('Data inválida.')
  const [year, month, day] = input.occurredOn.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (year < 1900 || year > 2100 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('Data inválida.')
  }
  const prior = input.id ? existing.find((item) => item.id === input.id) : undefined
  if (input.id && !prior) throw new Error('Lançamento não encontrado.')
  // undefined mantém o vínculo ao editar; null permite desvincular expressamente.
  const projectId = input.budgetProjectId === undefined ? prior?.budgetProjectId : input.budgetProjectId
  const itemId = input.budgetItemId === undefined ? prior?.budgetItemId : input.budgetItemId
  if (Boolean(projectId) !== Boolean(itemId)) throw new Error('É necessário informar projeto e item juntos.')
  if (projectId && input.kind !== 'expense') throw new Error('Apenas despesas podem ser vinculadas a projetos.')
  const transaction: Transaction = {
    id: prior?.id ?? crypto.randomUUID(),
    createdAt: prior?.createdAt ?? new Date().toISOString(),
    description,
    amountCents: input.amountCents,
    category,
    kind: input.kind,
    occurredOn: input.occurredOn,
    ...(projectId && itemId ? { budgetProjectId: projectId, budgetItemId: itemId } : {}),
  }
  repository.save(transaction)
  return transaction
}
