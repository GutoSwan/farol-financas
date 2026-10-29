import type { WorkspaceRole, WorkspaceSummary } from '../entities/Workspace.js'

export interface WorkspaceRepository {
  listForUser(userId: string): Promise<WorkspaceSummary[]>
  createOwnedBy(userId: string, name: string): Promise<WorkspaceSummary>
  hasMembership(userId: string, workspaceId: string, allowedRoles?: WorkspaceRole[]): Promise<boolean>
}
