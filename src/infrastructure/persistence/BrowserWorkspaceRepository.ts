import { DEFAULT_WORKSPACE, DEFAULT_WORKSPACE_ID } from '../../domain/entities/FinancialWorkspace'
import type { FinancialWorkspace } from '../../domain/entities/FinancialWorkspace'
import type { WorkspaceRepository } from '../../domain/repositories/WorkspaceRepository'
import { billsStorageKey } from './BrowserBillRepository'
import { transactionStorageKey } from './BrowserTransactionRepository'
import { budgetStorageKey } from './BrowserBudgetRepository'

const WORKSPACES_KEY = 'farol-financas:workspaces:v1'
const ACTIVE_KEY = 'farol-financas:active-workspace:v1'

function validateWorkspace(value: unknown): value is FinancialWorkspace {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<FinancialWorkspace>
  return typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.name === 'string' && item.name.trim().length > 0 &&
    typeof item.createdAt === 'string'
}

/**
 * Espacos locais de prototipagem, NAO usuarios ou perfis com permissao.
 * Nao concede isolamento seguro ou acesso em outros dispositivos.
 */
export class BrowserWorkspaceRepository implements WorkspaceRepository {
  list(): FinancialWorkspace[] {
    try {
      const value = localStorage.getItem(WORKSPACES_KEY)
      if (!value) return [DEFAULT_WORKSPACE]
      const parsed: unknown = JSON.parse(value)
      if (!Array.isArray(parsed) || !parsed.every(validateWorkspace)) throw new Error('invalid')
      return [DEFAULT_WORKSPACE, ...parsed.filter((item) => item.id !== DEFAULT_WORKSPACE_ID)]
    } catch {
      throw new Error('Não foi possível ler os espaços salvos. Seus dados não foram apagados.')
    }
  }

  getActiveId(): string {
    const active = localStorage.getItem(ACTIVE_KEY)
    const existing = this.list()
    return existing.some((item) => item.id === active) ? (active as string) : DEFAULT_WORKSPACE_ID
  }

  create(rawName: string): FinancialWorkspace {
    const name = rawName.trim()
    if (name.length < 2 || name.length > 60) throw new Error('Digite um nome entre 2 e 60 caracteres.')
    const existing = this.list()
    if (existing.some((item) => item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
      throw new Error('Já existe um espaço com este nome.')
    }
    const item: FinancialWorkspace = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() }
    try {
      localStorage.setItem(WORKSPACES_KEY, JSON.stringify([...existing.filter((entry) => entry.id !== DEFAULT_WORKSPACE_ID), item]))
      return item
    } catch {
      throw new Error('Não foi possível salvar o novo espaço neste navegador.')
    }
  }

  select(id: string): void {
    if (!this.list().some((item) => item.id === id)) throw new Error('Espaço não encontrado.')
    try {
      localStorage.setItem(ACTIVE_KEY, id)
    } catch {
      throw new Error('Não foi possível alterar o espaço ativo.')
    }
  }

  delete(id: string): void {
    if (id === DEFAULT_WORKSPACE_ID) throw new Error('O espaço inicial está protegido para preservar os registros originais.')
    const existing = this.list()
    if (!existing.some((item) => item.id === id)) throw new Error('Espaço não encontrado.')
    const rest = existing.filter((item) => item.id !== DEFAULT_WORKSPACE_ID && item.id !== id)
    const previous = this.getActiveId()

    try {
      // A exclusão de dados vem antes da retirada do espaço da lista.
      localStorage.removeItem(billsStorageKey(id))
      localStorage.removeItem(billsStorageKey(id) + ':fixed-expenses:v1')
      localStorage.removeItem(transactionStorageKey(id))
      localStorage.removeItem(budgetStorageKey(id))
      localStorage.setItem(WORKSPACES_KEY, JSON.stringify(rest))
      if (previous === id) localStorage.setItem(ACTIVE_KEY, DEFAULT_WORKSPACE_ID)
    } catch {
      throw new Error('Falha ao excluir espaço ou seus registros. Confira os dados locais antes de tentar novamente.')
    }
  }
}
