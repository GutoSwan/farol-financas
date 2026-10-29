import type { BudgetProject } from '../entities/BudgetProject'
import type { BudgetItem } from '../entities/BudgetItem'
import type { BudgetQuote } from '../entities/BudgetQuote'

export interface BudgetSnapshot {
  projects: BudgetProject[]
  items: BudgetItem[]
  quotes: BudgetQuote[]
}
export interface BudgetRepository {
  read(): BudgetSnapshot
  save(snapshot: BudgetSnapshot): void
}
