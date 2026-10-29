import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'
import type { WorkspaceSummary, WorkspaceRole } from '../src/domain/entities/Workspace.js'
import type { AuthVerifier } from '../src/infrastructure/auth/SupabaseJwtVerifier.js'

const userId = '123e4567-e89b-42d3-a456-426614174000'

function fixtures() {
  const records = new Map<string, WorkspaceSummary[]>()
  const repository: WorkspaceRepository = {
    async listForUser(id) { return records.get(id) ?? [] },
    async createOwnedBy(id, name) {
      const saved: WorkspaceSummary = { id: 'new-workspace-id', name, role: 'OWNER' }
      records.set(id, [...(records.get(id) ?? []), saved])
      return saved
    },
    async hasMembership(id, workspaceId, roles: WorkspaceRole[] = []) {
      const existing = (records.get(id) ?? []).find((item) => item.id === workspaceId)
      return !!existing && (!roles.length || roles.includes(existing.role))
    },
  }
  const auth: AuthVerifier = {
    async verifyAccessToken(token) {
      if (token !== 'valid-for-test') throw new Error('invalid')
      return { userId }
    },
  }
  const app = buildApp({ auth, workspaceService: new WorkspaceService(repository), checkDatabase: async () => true })
  return { app, records }
}

describe('Farol API v0.4', () => {
  it('responde health sem autenticação', async () => {
    const { app } = fixtures()
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ status: 'ok', service: 'farol-api' })
    await app.close()
  })

  it('responde readiness indisponível sem vazar erro do banco', async () => {
    const { app } = fixtures()
    await app.close()
    const isolated = buildApp({
      auth: { async verifyAccessToken() { return { userId } } },
      workspaceService: new WorkspaceService({ 
        async listForUser() { return [] }, async createOwnedBy() { throw new Error('unused') },
        async hasMembership() { return false },
      }),
      async checkDatabase() { throw new Error('postgresql://secret:password@private-server') },
    })
    const response = await isolated.inject({ method: 'GET', url: '/api/v1/ready' })
    expect(response.statusCode).toBe(503)
    expect(response.body).not.toContain('password')
    await isolated.close()
  })

  it('nega acesso sem token ou com token inválido', async () => {
    const { app } = fixtures()
    const noToken = await app.inject({ method: 'GET', url: '/api/v1/workspaces' })
    const invalid = await app.inject({ method: 'GET', url: '/api/v1/workspaces', headers: { authorization: 'Bearer fake' } })
    expect(noToken.statusCode).toBe(401)
    expect(invalid.statusCode).toBe(401)
    await app.close()
  })

  it('cria espaço associado ao usuário autenticado e retorna só os seus espaços', async () => {
    const { app } = fixtures()
    const headers = { authorization: 'Bearer valid-for-test' }
    const created = await app.inject({ method: 'POST', url: '/api/v1/workspaces', headers, payload: { name: '  Casa e família  ' } })
    expect(created.statusCode).toBe(201)
    expect(created.json().data).toMatchObject({ role: 'OWNER', name: 'Casa e família' })
    const listed = await app.inject({ method: 'GET', url: '/api/v1/workspaces', headers })
    expect(listed.json().data).toHaveLength(1)
    await app.close()
  })

  it('rejeita nomes vazios e campos não autorizados', async () => {
    const { app } = fixtures()
    const headers = { authorization: 'Bearer valid-for-test' }
    const a = await app.inject({ method: 'POST', url: '/api/v1/workspaces', headers, payload: { name: '  ' } })
    const b = await app.inject({ method: 'POST', url: '/api/v1/workspaces', headers, payload: { name: 'Casa', userId: 'outro' } })
    expect(a.statusCode).toBe(400)
    expect(b.statusCode).toBe(400)
    await app.close()
  })
})
