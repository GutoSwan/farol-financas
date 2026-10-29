import type { FixedExpense } from '../entities/FixedExpense'
export interface FixedExpenseRepository {
  list(): FixedExpense[]
  save(item: FixedExpense): void
}
