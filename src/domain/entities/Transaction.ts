/** Lançamento avulso: não é uma cobrança recorrente e não gera fatura de cartão. */
export type TransactionKind = 'expense' | 'income'

export const TRANSACTION_CATEGORIES = [
  'Mercado', 'Moradia', 'Transporte', 'Saúde', 'Alimentação',
  'Lazer', 'Assinaturas', 'Educação', 'Salário', 'Outros',
] as const
export type TransactionCategory = typeof TRANSACTION_CATEGORIES[number]

export interface Transaction {
  id: string
  description: string
  amountCents: number
  category: TransactionCategory
  kind: TransactionKind
  occurredOn: string // YYYY-MM-DD (data local)
  createdAt: string
}
