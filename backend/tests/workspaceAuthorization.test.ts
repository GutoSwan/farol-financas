import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'

const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const privateWorkspace = '33333333-3333-4333-8333-333333333333'
const sharedWorkspace = '44444444-4444-4444-8444-444444444444'

function createApp() {
  const repo: WorkspaceRepository = {
    async listForUser(userId) {
      if (userId === alice) return [
        { id: privateWorkspace, name: 'Família', role: 'OWNER' as const },
        { id: sharedWorkspace, name: 'Compartilhado', role: 'OWNER' as const },
      ]
      return userId === bob ? [{ id: sharedWorkspace, name: 'Compartilhado', role: 'VIEWER' as const }] : []
    },
    async createOwnedBy(_userId, name) { return { id: privateWorkspace, name, role: 'OWNER' as const } },
    async hasMembership(userId, workspaceId, allowedRoles = []) {
      const role = userId === alice && [privateWorkspace, sharedWorkspace].includes(workspaceId) ? 'OWNER'
        : userId === bob && workspaceId === sharedWorkspace ? 'VIEWER' : null
      return role !== null && (!allowedRoles.length || allowedRoles.includes(role))
    },
  }
  return buildApp({
    auth: {
      async verifyAccessToken(token) {
        if (token === 'alice-aal2') return { userId: alice, assuranceLevel: 'aal2' as const }
        if (token === 'bob-aal2') return { userId: bob, assuranceLevel: 'aal2' as const }
        if (token === 'alice-aal1') return { userId: alice, assuranceLevel: 'aal1' as const, mfaRequired: false }
        if (token === 'bob-aal1-mfa') return { userId: bob, assuranceLevel: 'aal1' as const, mfaRequired: true }
        throw new Error('invalid token')
      },
    },
    workspaceService: new WorkspaceService(repo),
    checkDatabase: async () => true,
    allowWorkspaceWrites: false,
  })
}

describe('API: isolamento de workspace por ID', () => {
  it('lista somente os espaços do usuário autenticado com o papel correto', async () => {
    const app = createApp()
    try {
      const owner = await app.inject({ method: 'GET', url: '/api/v1/workspaces', headers: { authorization: 'Bearer alice-aal2' } })
      const viewer = await app.inject({ method: 'GET', url: '/api/v1/workspaces', headers: { authorization: 'Bearer bob-aal2' } })
      expect(owner.statusCode).toBe(200)
      expect(owner.json().data.map((space: { id: string }) => space.id)).toEqual([privateWorkspace, sharedWorkspace])
      expect(viewer.statusCode).toBe(200)
      expect(viewer.json().data).toEqual([{ id: sharedWorkspace, name: 'Compartilhado', role: 'VIEWER' }])
    } finally { await app.close() }
  })

  it('permite ao Viewer ler o espaço compartilhado, mas não o privado por UUID', async () => {
    const app = createApp()
    try {
      const allowed = await app.inject({ method: 'GET', url: '/api/v1/workspaces/' + sharedWorkspace,
        headers: { authorization: 'Bearer bob-aal2' } })
      expect(allowed.statusCode).toBe(200)
      expect(allowed.json().data.role).toBe('VIEWER')
      for (const suffix of ['', '/transactions', '/recurring-bills', '/fixed-expenses', '/budgets']) {
        const denied = await app.inject({ method: 'GET', url: '/api/v1/workspaces/' + privateWorkspace + suffix,
          headers: { authorization: 'Bearer bob-aal2' } })
        expect(denied.statusCode).toBe(404)
        expect(denied.body).not.toContain('Família')
      }
    } finally { await app.close() }
  })

  it('exige 2FA antes de responder até mesmo sobre a própria identidade', async () => {
    const app = createApp()
    try {
      for (const url of ['/api/v1/me', '/api/v1/workspaces', '/api/v1/workspaces/' + sharedWorkspace]) {
        const denied = await app.inject({ method: 'GET', url,
          headers: { authorization: 'Bearer bob-aal1-mfa' } })
        expect(denied.statusCode).toBe(403)
      }
    } finally { await app.close() }
  })
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
  it('permite ao dono acessar com sua senha', async () => {
    const app = createApp()
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/' + privateWorkspace, headers: { authorization: 'Bearer alice-aal1' } })
      expect(res.statusCode).toBe(200)
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
