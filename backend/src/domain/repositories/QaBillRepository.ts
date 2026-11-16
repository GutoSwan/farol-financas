import type { RecurringBillSummary } from './FinancialCatalogRepository.js'

/** API de escrita exclusivamente para os dois espaços fictícios do Supabase Dev. */
export interface QaBillInput {
  name: string
  dueDay: number
  active: boolean
}
export interface QaMonthInput {
  yearMonth: string
  amountCents: number
  status: 'PENDING' | 'PAID'
}
export interface QaBillRepository {
  create(workspaceId: string, input: QaBillInput): Promise<RecurringBillSummary>
  update(workspaceId: string, billId: string, version: number, input: Partial<QaBillInput>): Promise<RecurringBillSummary | null>
  upsertMonth(workspaceId: string, billId: string, version: number, input: QaMonthInput): Promise<RecurringBillSummary | null>
  removeMonth(workspaceId: string, billId: string, version: number, yearMonth: string): Promise<RecurringBillSummary | null>
  delete(workspaceId: string, billId: string, version: number): Promise<boolean>
}

export class QaBillMonthMissingError extends Error {
  constructor() { super('Mês não encontrado nesta conta.') }
}
