import type { FinancialWorkspace } from '../../domain/entities/FinancialWorkspace'
import { BrowserWorkspaceRepository } from '../../infrastructure/persistence/BrowserWorkspaceRepository'
import { BrowserBillRepository } from '../../infrastructure/persistence/BrowserBillRepository'
import { BrowserFixedExpenseRepository } from '../../infrastructure/persistence/BrowserFixedExpenseRepository'
import { BrowserTransactionRepository } from '../../infrastructure/persistence/BrowserTransactionRepository'
import { BrowserBudgetRepository } from '../../infrastructure/persistence/BrowserBudgetRepository'

/**
 * Snapshot local, SOMENTE LEITURA. Nunca inclui tokens Supabase, metadados de
 * autenticação, preferências, presentes ou fotos. Não sincroniza nem importa nada.
 */
export function buildLocalFinancialBackup() {
  const repository = new BrowserWorkspaceRepository()
  const spaces = repository.list()
  const activeWorkspaceId = repository.getActiveId()
  const workspaces = spaces.map((workspace: FinancialWorkspace) => ({
    workspace,
    bills: new BrowserBillRepository(workspace.id).listBills(),
    monthlyEntries: new BrowserBillRepository(workspace.id).listEntries(),
    fixedExpenses: new BrowserFixedExpenseRepository(workspace.id).list(),
    transactions: new BrowserTransactionRepository(workspace.id).list(),
    budgets: new BrowserBudgetRepository(workspace.id).read(),
  }))
  return {
    format: 'farol-financas-local-backup' as const,
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    activeWorkspaceId,
    workspaces,
  }
}

