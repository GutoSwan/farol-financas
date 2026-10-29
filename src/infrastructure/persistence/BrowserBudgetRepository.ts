import type { BudgetRepository, BudgetSnapshot } from '../../domain/repositories/BudgetRepository'
import { billsStorageKey } from './BrowserBillRepository'

const initial = (): BudgetSnapshot => ({ projects: [], items: [], quotes: [] })
/** Somente persistência local de protótipo, separada por espaço financeiro. */
export function budgetStorageKey(workspaceId: string): string {
  return billsStorageKey(workspaceId) + ':budget-projects:v1'
}

export class BrowserBudgetRepository implements BudgetRepository {
  constructor(private readonly workspaceId: string) {}

  read(): BudgetSnapshot {
    try {
      const raw = localStorage.getItem(budgetStorageKey(this.workspaceId))
      if (!raw) return initial()
      const value: unknown = JSON.parse(raw)
      if (!value || typeof value !== 'object') throw new Error('Estrutura desconhecida')
      const snapshot = value as BudgetSnapshot
      if (!Array.isArray(snapshot.projects) || !Array.isArray(snapshot.items) || !Array.isArray(snapshot.quotes)) {
        throw new Error('Estrutura desconhecida')
      }
      return snapshot
    } catch {
      throw new Error('Não foi possível ler orçamentos locais. Não limpe o navegador antes de recuperar os registros.')
    }
  }

  save(snapshot: BudgetSnapshot): void {
    try {
      localStorage.setItem(budgetStorageKey(this.workspaceId), JSON.stringify(snapshot))
    } catch {
      throw new Error('Não foi possível salvar o orçamento neste navegador.')
    }
  }
}
