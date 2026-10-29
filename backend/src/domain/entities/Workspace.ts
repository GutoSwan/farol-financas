export type WorkspaceRole = 'OWNER' | 'EDITOR' | 'VIEWER'

export interface WorkspaceSummary {
  id: string
  name: string
  role: WorkspaceRole
}
