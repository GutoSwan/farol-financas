/** Cotação recebida para um item. Aceita diferentes profissionais e lojas. */
export interface BudgetQuote {
  id: string
  itemId: string
  provider: string
  amountCents: number
  estimatedDays: number | null
  materialsIncluded: boolean
  notes: string
  selected: boolean
  createdAt: string
}
