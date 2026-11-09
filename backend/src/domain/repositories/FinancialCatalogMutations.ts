export type CatalogKind = 'recurring-bills' | 'fixed-expenses' | 'budgets'
export type BudgetStatus = 'PLANNING' | 'QUOTING' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED'
export interface BillInput { name: string; dueDay: number; active: boolean }
export interface FixedInput { name: string; amountCents: number; dueDay: number; startMonth: string; endBeforeMonth: string | null }
export interface BudgetInput { title: string; category: string; targetCents: number; status: BudgetStatus; notes: string }
export type CatalogCreate =
 | { kind: 'recurring-bills'; workspaceId: string; data: BillInput }
 | { kind: 'fixed-expenses'; workspaceId: string; data: FixedInput }
 | { kind: 'budgets'; workspaceId: string; data: BudgetInput }
export type CatalogUpdate =
 | { kind: 'recurring-bills'; workspaceId: string; id: string; expectedVersion: number; data: Partial<BillInput> }
 | { kind: 'fixed-expenses'; workspaceId: string; id: string; expectedVersion: number; data: Partial<FixedInput> }
 | { kind: 'budgets'; workspaceId: string; id: string; expectedVersion: number; data: Partial<BudgetInput> }
export interface FinancialCatalogMutations {
 create(input: CatalogCreate): Promise<unknown>
 update(input: CatalogUpdate): Promise<unknown | null>
 delete(kind: CatalogKind, workspaceId: string, id: string, expectedVersion: number): Promise<boolean>
}
