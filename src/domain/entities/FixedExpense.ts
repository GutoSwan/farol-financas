/** Valor fixo todo mês. Não usar para água/luz quando variam mensalmente. */
export interface FixedExpense {
  id: string
  name: string
  amountCents: number
  dueDay: number
  startMonth: string
  /** Primeiro mês em que a cobrança deixa de ocorrer (exclusive). */
  endBeforeMonth: string | null
  paidMonths: string[]
  createdAt: string
}
