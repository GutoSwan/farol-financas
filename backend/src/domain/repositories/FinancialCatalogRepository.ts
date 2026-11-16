/** Projeções mínimas: histórico restrito ao cadastro pai, já filtrado por espaço. */
export interface MonthlyBillSummary {
  id: string; billId: string; yearMonth: string; amountCents: number
  status: 'PENDING' | 'PAID'; paidAt: Date | null
}
export interface RecurringBillSummary {
  id: string; workspaceId: string; name: string; dueDay: number; active: boolean
  version?: number; entries?: MonthlyBillSummary[]
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
