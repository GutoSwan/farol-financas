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
}

export function saveTransaction(repository: TransactionRepository, input: TransactionInput): Transaction {
  const description = input.description.trim()
  if (description.length < 2 || description.length > 120) throw new Error('Descrição deve ter de 2 a 120 caracteres.')
  assertMoney(input.amountCents)
  if (input.amountCents === 0) throw new Error('O valor precisa ser maior que zero.')
  if (!TRANSACTION_CATEGORIES.includes(input.category)) throw new Error('Categoria inválida.')
  if (input.kind !== 'expense' && input.kind !== 'income') throw new Error('Tipo de lançamento inválido.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) throw new Error('Data inválida.')
  const [year, month, day] = input.occurredOn.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (year < 1900 || year > 2100 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('Data inválida.')
  }
  const prior = input.id ? repository.list().find((item) => item.id === input.id) : undefined
  if (input.id && !prior) throw new Error('Lançamento não encontrado.')
  const transaction: Transaction = {
    id: prior?.id ?? crypto.randomUUID(),
    createdAt: prior?.createdAt ?? new Date().toISOString(),
    description,
    amountCents: input.amountCents,
    category: input.category,
    kind: input.kind,
    occurredOn: input.occurredOn,
  }
  repository.save(transaction)
  return transaction
}
