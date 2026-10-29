import type { Transaction } from '../../domain/entities/Transaction'
import type { TransactionRepository } from '../../domain/repositories/TransactionRepository'
import { DEFAULT_WORKSPACE_ID } from '../../domain/entities/FinancialWorkspace'

const KEY_PREFIX = 'farol-financas:transactions:v1'

export function transactionStorageKey(workspaceId: string): string {
  if (workspaceId !== DEFAULT_WORKSPACE_ID && !/^[a-zA-Z0-9-]{1,90}$/.test(workspaceId)) {
    throw new Error('Identificador de espaço inválido.')
  }
  return `${KEY_PREFIX}:${workspaceId}`
}

/** Protótipo: isolamento lógico por espaço, sem autenticação ou privacidade entre usuários do navegador. */
export class BrowserTransactionRepository implements TransactionRepository {
  constructor(private readonly workspaceId: string) {}

  list(): Transaction[] {
    try {
      const stored = localStorage.getItem(transactionStorageKey(this.workspaceId))
      if (!stored) return []
      const parsed: unknown = JSON.parse(stored)
      if (!Array.isArray(parsed) || !parsed.every((item: unknown) => {
        if (!item || typeof item !== 'object') return false
        const value = item as Partial<Transaction>
        return typeof value.id === 'string' && typeof value.description === 'string' &&
          typeof value.amountCents === 'number' && Number.isSafeInteger(value.amountCents) && value.amountCents > 0 &&
          (value.kind === 'expense' || value.kind === 'income') &&
          typeof value.category === 'string' && typeof value.occurredOn === 'string'
      })) throw new Error('Registros inválidos')
      return parsed as Transaction[]
    } catch {
      throw new Error('Não foi possível ler os lançamentos locais. Não apague os dados do navegador.')
    }
  }

  private write(items: Transaction[]): void {
    try {
      localStorage.setItem(transactionStorageKey(this.workspaceId), JSON.stringify(items))
    } catch {
      throw new Error('Não foi possível salvar os lançamentos.')
    }
  }

  save(entry: Transaction): void {
    const all = this.list()
    const index = all.findIndex((item) => item.id === entry.id)
    if (index >= 0) all[index] = entry
    else all.push(entry)
    this.write(all)
  }

  delete(id: string): void {
    const all = this.list()
    if (!all.some((item) => item.id === id)) throw new Error('Lançamento não encontrado.')
    this.write(all.filter((item) => item.id !== id))
  }
}
