/** Projeto de orçamento, separado de transações financeiras. Valores em centavos. */
export type BudgetProjectStatus = 'planning' | 'quoting' | 'approved' | 'in-progress' | 'completed'
export interface BudgetProject {
  id: string
  title: string
  category: string
  targetCents: number
  status: BudgetProjectStatus
  notes: string
  createdAt: string
}
