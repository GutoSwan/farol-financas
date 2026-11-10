import { describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'

const superUser = '11111111-1111-4111-8111-111111111111'
const normalUser = '22222222-2222-4222-8222-222222222222'
const spaces: WorkspaceRepository = {
  listForUser: async () => [],
  createOwnedBy: async () => { throw new Error('Unexpected write') },
  hasMembership: async () => false,
}

function testApp() {
  const checkSuperAdmin = vi.fn(async (id: string) => id === superUser)
  const app = buildApp({
    auth: {
      async verifyAccessToken(token: string) {
        if (token === 'super-aal2') return { userId: superUser, assuranceLevel: 'aal2' }
        if (token === 'super-aal1') return { userId: superUser, assuranceLevel: 'aal1' }
        if (token === 'user-aal2') return { userId: normalUser, assuranceLevel: 'aal2' }
        throw new Error('Invalid token')
      },
    },
    workspaceService: new WorkspaceService(spaces),
    checkDatabase: async () => true,
    checkSuperAdmin,
  })
  return { app, checkSuperAdmin }
}

describe('Super Admin: API nunca confia somente no menu', () => {
  it('exige um token válido para a rota protegida', async () => {
    const { app, checkSuperAdmin } = testApp()
    try {
      for (const token of [undefined, 'invalid']) {
        const response = await app.inject({
          method: 'GET', url: '/api/v1/admin/access',
          headers: token ? { authorization: 'Bearer ' + token } : {},
        })
        expect(response.statusCode).toBe(401)
      }
      expect(checkSuperAdmin).not.toHaveBeenCalled()
    } finally { await app.close() }
  })

  it('exige 2FA AAL2 antes de consultar o papel do usuário', async () => {
    const { app, checkSuperAdmin } = testApp()
    try {
      const response = await app.inject({ method: 'GET', url: '/api/v1/admin/access',
        headers: { authorization: 'Bearer super-aal1' } })
      expect(response.statusCode).toBe(403)
      expect(checkSuperAdmin).not.toHaveBeenCalled()
    } finally { await app.close() }
  })

  it('uma conta comum não consegue abrir administração, mesmo com AAL2', async () => {
    const { app, checkSuperAdmin } = testApp()
    try {
      const response = await app.inject({ method: 'GET', url: '/api/v1/admin/access',
        headers: { authorization: 'Bearer user-aal2' } })
      expect(response.statusCode).toBe(403)
      expect(checkSuperAdmin).toHaveBeenCalledWith(normalUser, 'user-aal2')
    } finally { await app.close() }
  })

  it('autoriza apenas quando o servidor confirma o papel atual', async () => {
    const { app } = testApp()
    try {
      const response = await app.inject({ method: 'GET', url: '/api/v1/admin/access',
        headers: { authorization: 'Bearer super-aal2' } })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ data: { superAdmin: true } })
      expect(response.headers['cache-control']).toContain('no-store')
      expect(response.body).not.toContain(superUser)
    } finally { await app.close() }
  })

  it('sem verificador administrativo configurado o acesso permanece fechado', async () => {
    const app = buildApp({
      auth: { verifyAccessToken: async () => ({ userId: superUser, assuranceLevel: 'aal2' }) },
      workspaceService: new WorkspaceService(spaces),
      checkDatabase: async () => true,
    })
    try {
      const response = await app.inject({ method: 'GET', url: '/api/v1/admin/access',
        headers: { authorization: 'Bearer token' } })
      expect(response.statusCode).toBe(403)
    } finally { await app.close() }
  })

  it('um erro na consulta de privilégios nunca libera acesso', async () => {
    const app = buildApp({
      auth: { verifyAccessToken: async () => ({ userId: superUser, assuranceLevel: 'aal2' }) },
      workspaceService: new WorkspaceService(spaces),
      checkDatabase: async () => true,
      checkSuperAdmin: async () => { throw new Error('Database inaccessible') },
    })
    try {
      const response = await app.inject({ method: 'GET', url: '/api/v1/admin/access',
        headers: { authorization: 'Bearer token' } })
      expect(response.statusCode).toBe(500)
      expect(response.body).not.toContain('Database inaccessible')
    } finally { await app.close() }
  })
  it('revogar a permissão no servidor impede o próximo acesso, mesmo com token antigo', async () => {
    let allowed = true
    const authorization = vi.fn(async () => allowed)
    const app = buildApp({
      auth: { verifyAccessToken: async () => ({ userId: superUser, assuranceLevel: 'aal2' }) },
      workspaceService: new WorkspaceService(spaces),
      checkDatabase: async () => true,
      checkSuperAdmin: authorization,
    })
    try {
      const req = () => app.inject({ method: 'GET', url: '/api/v1/admin/access',
        headers: { authorization: 'Bearer unchanged-token' } })
      expect((await req()).statusCode).toBe(200)
      allowed = false
      expect((await req()).statusCode).toBe(403)
      expect(authorization).toHaveBeenCalledTimes(2)
    } finally { await app.close() }
  })

  it('não revela informações de contas privilegiadas em falhas de autorização', async () => {
    const { app } = testApp()
    try {
      const response = await app.inject({
        method: 'GET', url: '/api/v1/admin/access',
        headers: { authorization: 'Bearer user-aal2' },
      })
      expect(response.statusCode).toBe(403)
      expect(response.headers['cache-control']).toContain('no-store')
      expect(response.body).not.toContain('raw_app_meta_data')
      expect(response.body).not.toContain(normalUser)
      expect(response.body).not.toContain(superUser)
    } finally { await app.close() }
  })

})
