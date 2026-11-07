/** Projeções mínimas: não retornar relações ou registros de outros espaços. */
export interface RecurringBillSummary {
  id: string; workspaceId: string; name: string; dueDay: number; active: boolean
}
export interface FixedExpenseSummary {
  id: string; workspaceId: string; name: string; amountCents: number; dueDay: number
  startMonth: string; endBeforeMonth: string | null
}
export interface BudgetSummary {
  id: string; workspaceId: string; title: string; category: string
  targetCents: number; status: 'PLANNING' | 'QUOTING' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED'
}
export interface FinancialCatalogRepository {
  listRecurringBills(workspaceId: string, limit: number): Promise<RecurringBillSummary[]>
  listFixedExpenses(workspaceId: string, limit: number): Promise<FixedExpenseSummary[]>
  listBudgets(workspaceId: string, limit: number): Promise<BudgetSummary[]>
}
