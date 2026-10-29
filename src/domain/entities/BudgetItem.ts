/** Cada projeto pode ter vários itens: pedreiro, pisos, argamassa, etc. */
export interface BudgetItem {
  id: string
  projectId: string
  title: string
  plannedCents: number | null
  createdAt: string
}
