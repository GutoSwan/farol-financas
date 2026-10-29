/** Lançamento avulso: não é uma cobrança recorrente nem uma compra de cartão. */
export type TransactionKind = 'expense' | 'income'

/** Sugestões iniciais: o usuário também pode digitar uma categoria própria. */
export const TRANSACTION_CATEGORIES = [
  'Mercado', 'Moradia', 'Transporte', 'Saúde', 'Alimentação',
  'Lazer', 'Assinaturas', 'Educação', 'Salário', 'Outros',
] as const

export type TransactionCategory = string

export interface Transaction {
  id: string
  description: string
  amountCents: number
  category: TransactionCategory
  kind: TransactionKind
  occurredOn: string // YYYY-MM-DD no horário local
  createdAt: string
  /** Vínculo opcional com projeto de orçamento: não cria despesa adicional. */
  budgetProjectId?: string
  budgetItemId?: string
}
