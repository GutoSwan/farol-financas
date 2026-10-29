import type { FinancialWorkspace } from '../entities/FinancialWorkspace'

export interface WorkspaceRepository {
  list(): FinancialWorkspace[]
  getActiveId(): string
  create(name: string): FinancialWorkspace
  select(id: string): void
  delete(id: string): void
}
