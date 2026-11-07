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

export type TransactionChanges = Partial<Omit<NewTransaction, 'workspaceId'>>

export interface TransactionRepository {
  listForWorkspace(workspaceId: string, limit: number): Promise<TransactionEntry[]>
  createForWorkspace(entry: NewTransaction): Promise<TransactionEntry>
  updateWithinWorkspace(workspaceId: string, transactionId: string, changes: TransactionChanges): Promise<TransactionEntry | null>
  deleteWithinWorkspace(workspaceId: string, transactionId: string): Promise<boolean>
}
