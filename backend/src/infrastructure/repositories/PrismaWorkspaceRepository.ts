import type { PrismaClient } from '@prisma/client'
import type { WorkspaceRole, WorkspaceSummary } from '../../domain/entities/Workspace.js'
import type { WorkspaceRepository } from '../../domain/repositories/WorkspaceRepository.js'

export class PrismaWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listForUser(userId: string): Promise<WorkspaceSummary[]> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      select: { role: true, workspace: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return memberships.map(({ role, workspace }) => ({ id: workspace.id, name: workspace.name, role }))
  }

  async createOwnedBy(userId: string, name: string): Promise<WorkspaceSummary> {
    return this.prisma.$transaction(async (tx) => {
      // O ID vem de um JWT validado, nunca do corpo HTTP.
      await tx.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} })
      const space = await tx.workspace.create({
        data: { name, memberships: { create: { userId, role: 'OWNER' } } },
        select: { id: true, name: true },
      })
      return { id: space.id, name: space.name, role: 'OWNER' }
    })
  }

  async hasMembership(userId: string, workspaceId: string, allowedRoles: WorkspaceRole[] = []): Promise<boolean> {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { role: true },
    })
    if (!membership) return false
    return allowedRoles.length === 0 || allowedRoles.includes(membership.role)
  }
}
