import type { WorkspaceRepository } from '../../domain/repositories/WorkspaceRepository.js'
import type { WorkspaceRole, WorkspaceSummary } from '../../domain/entities/Workspace.js'

export class WorkspaceService {
  constructor(private readonly repository: WorkspaceRepository) {}

  listForUser(userId: string): Promise<WorkspaceSummary[]> {
    return this.repository.listForUser(userId)
  }

  async createWorkspace(userId: string, inputName: string): Promise<WorkspaceSummary> {
    const name = inputName.trim().replace(/\s+/g, ' ')
    if (name.length < 2 || name.length > 60) {
      throw new Error('O nome deve ter entre 2 e 60 caracteres.')
    }
    return this.repository.createOwnedBy(userId, name)
  }

  async requireMember(userId: string, workspaceId: string, allowedRoles: WorkspaceRole[] = []): Promise<void> {
    // Nunca aceitar o workspaceId como autorização por si só.
    if (!await this.repository.hasMembership(userId, workspaceId, allowedRoles)) {
      throw new Error('Acesso negado ao espaço financeiro.')
    }
  }
}
