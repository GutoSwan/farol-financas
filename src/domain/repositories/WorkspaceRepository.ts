import type { FinancialWorkspace } from '../entities/FinancialWorkspace'

/** Contrato independente da forma de persistência. */
export interface WorkspaceRepository {
  list(): FinancialWorkspace[]
  getActiveId(): string
  create(name: string): FinancialWorkspace
  select(id: string): void
}
