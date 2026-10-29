import type { Transaction } from '../entities/Transaction'

export interface TransactionRepository {
  list(): Transaction[]
  save(transaction: Transaction): void
  delete(id: string): void
}
