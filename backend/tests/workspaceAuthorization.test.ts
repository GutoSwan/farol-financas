import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'

const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const privateWorkspace = '33333333-3333-4333-8333-333333333333'

function createApp() {
  const repo: WorkspaceRepository = {
    async listForUser(userId) {
      return userId === alice ? [{ id: privateWorkspace, name: 'Família', role: 'OWNER' as const }] : []
    },
    async createOwnedBy(_userId, name) { return { id: privateWorkspace, name, role: 'OWNER' as const } },
    async hasMembership(userId, workspaceId, allowedRoles = []) {
      return userId === alice && workspaceId === privateWorkspace &&
        (!allowedRoles.length || allowedRoles.includes('OWNER'))
    },
  }
  return buildApp({
    auth: {
      async verifyAccessToken(token) {
        if (token === 'alice-aal2') return { userId: alice, assuranceLevel: 'aal2' as const }
        if (token === 'bob-aal2') return { userId: bob, assuranceLevel: 'aal2' as const }
        if (token === 'alice-aal1') return { userId: alice, assuranceLevel: 'aal1' as const }
        throw new Error('invalid token')
      },
    },
    workspaceService: new WorkspaceService(repo),
    checkDatabase: async () => true,
    allowWorkspaceWrites: false,
  })
}

describe('API: isolamento de workspace por ID', () => {
  it('não permite consulta sem token', async () => {
    const app = createApp()
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/' + privateWorkspace })
      expect(res.statusCode).toBe(401)
      expect(res.headers['cache-control']).toContain('no-store')
    } finally { await app.close() }
  })
  it('não revela o espaço de Alice para Bob, mesmo conhecendo o UUID', async () => {
    const app = createApp()
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/' + privateWorkspace, headers: { authorization: 'Bearer bob-aal2' } })
      expect(res.statusCode).toBe(404)
      expect(res.body).not.toContain('Família')
    } finally { await app.close() }
  })
  it('exige MFA mesmo do dono', async () => {
    const app = createApp()
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/' + privateWorkspace, headers: { authorization: 'Bearer alice-aal1' } })
      expect(res.statusCode).toBe(403)
    } finally { await app.close() }
  })
  it('permite ao dono com MFA acessar seu próprio espaço', async () => {
    const app = createApp()
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/' + privateWorkspace, headers: { authorization: 'Bearer alice-aal2' } })
      expect(res.statusCode).toBe(200)
      expect(res.json().data.id).toBe(privateWorkspace)
    } finally { await app.close() }
  })
  it('nega identificador inválido sem consultar o banco', async () => {
    const app = createApp()
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/not-a-uuid', headers: { authorization: 'Bearer alice-aal2' } })
      expect(res.statusCode).toBe(404)
    } finally { await app.close() }
  })
})
