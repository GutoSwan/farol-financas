import type { FixedExpense } from '../../domain/entities/FixedExpense'
import type { FixedExpenseRepository } from '../../domain/repositories/FixedExpenseRepository'
import { billsStorageKey } from './BrowserBillRepository'

/** Cada espaço financeiro mantém suas próprias despesas fixas no protótipo local. */
export class BrowserFixedExpenseRepository implements FixedExpenseRepository {
  constructor(private readonly workspaceId: string) {}

  private get key(): string {
    return billsStorageKey(this.workspaceId) + ':fixed-expenses:v1'
  }

  list(): FixedExpense[] {
    try {
      const value = localStorage.getItem(this.key)
      if (!value) return []
      const items: unknown = JSON.parse(value)
      if (!Array.isArray(items) || !items.every((item: unknown) => {
        if (!item || typeof item !== 'object') return false
        const fixed = item as Partial<FixedExpense>
        return typeof fixed.id === 'string' && typeof fixed.name === 'string' &&
          typeof fixed.amountCents === 'number' && Number.isSafeInteger(fixed.amountCents) &&
          typeof fixed.startMonth === 'string' && Array.isArray(fixed.paidMonths) &&
          typeof fixed.dueDay === 'number' && typeof fixed.createdAt === 'string' &&
          (fixed.endBeforeMonth === null || typeof fixed.endBeforeMonth === 'string')
      })) throw new Error('Dados inválidos.')
      return items as FixedExpense[]
    } catch {
      throw new Error('Não foi possível ler os gastos fixos. Não apague os dados do navegador.')
    }
  }

  save(item: FixedExpense): void {
    const items = this.list()
    const index = items.findIndex((existing) => existing.id === item.id)
    if (index < 0) items.push(item)
    else items[index] = item
    try {
      localStorage.setItem(this.key, JSON.stringify(items))
    } catch {
      throw new Error('Não foi possível salvar a despesa fixa.')
    }
  }
}
