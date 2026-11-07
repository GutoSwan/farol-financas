export interface TransactionEntry {
  id: string
  workspaceId: string
  description: string
  category: string
  amountCents: number
  kind: 'EXPENSE' | 'INCOME'
  occurredOn: string
}

export interface NewTransaction {
  workspaceId: string
  description: string
  category: string
  amountCents: number
  kind: 'EXPENSE' | 'INCOME'
  occurredOn: string
}

export interface TransactionRepository {
  listForWorkspace(workspaceId: string, limit: number): Promise<TransactionEntry[]>
  createForWorkspace(entry: NewTransaction): Promise<TransactionEntry>
}
