import { describe, expect, it } from 'vitest'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'

function makeService() {
  const owners = new Map<string, string>()
  const repository: WorkspaceRepository = {
    async listForUser(userId) {
      return [...owners.entries()].filter(([, id]) => id === userId)
        .map(([id]) => ({ id, name: 'Minha casa', role: 'OWNER' as const }))
    },
    async createOwnedBy(userId, name) {
      const id = 'workspace-1'
      owners.set(id, userId)
      return { id, name, role: 'OWNER' as const }
    },
    async hasMembership(userId, workspaceId, roles = []) {
      return owners.get(workspaceId) === userId && (!roles.length || roles.includes('OWNER'))
    },
  }
  return new WorkspaceService(repository)
}

describe('Autorização por espaço', () => {
  it('não permite a um usuário consultar permissão em espaço alheio', async () => {
    const service = makeService()
    await service.createWorkspace('usuario-1', '  Minha casa  ')
    await expect(service.requireMember('usuario-2', 'workspace-1')).rejects.toThrow('Acesso negado')
    await expect(service.requireMember('usuario-1', 'workspace-1', ['EDITOR'])).rejects.toThrow('Acesso negado')
    await expect(service.requireMember('usuario-1', 'workspace-1', ['OWNER'])).resolves.toBeUndefined()
  })
  it('valida o nome no caso de uso', async () => {
    const service = makeService()
    await expect(service.createWorkspace('usuario', ' ')).rejects.toThrow()
  })
})
