import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'
import type { FinancialCatalogRepository } from '../src/domain/repositories/FinancialCatalogRepository.js'

const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const viewer = '44444444-4444-4444-8444-444444444444'
const workspace = '33333333-3333-4333-8333-333333333333'
const kinds = ['recurring-bills', 'fixed-expenses', 'budgets'] as const

function fixture() {
 const calls: string[] = []
 const workspaces: WorkspaceRepository = {
   async listForUser() { return [] },
   async createOwnedBy() { throw new Error('unused') },
   async hasMembership(userId, workspaceId) {
     return workspaceId === workspace && (userId === alice || userId === viewer)
   },
 }
 const catalog: FinancialCatalogRepository = {
   async listRecurringBills(workspaceId, limit) {
     calls.push('bills:' + workspaceId + ':' + limit)
     return [{ id: 'bill', workspaceId, name: 'Água', dueDay: 10, active: true }]
   },
   async listFixedExpenses(workspaceId, limit) {
     calls.push('fixed:' + workspaceId + ':' + limit)
     return [{ id: 'fixed', workspaceId, name: 'Internet', amountCents: 8000, dueDay: 5, startMonth: '2026-01', endBeforeMonth: null }]
   },
   async listBudgets(workspaceId, limit) {
     calls.push('budgets:' + workspaceId + ':' + limit)
     return [{ id: 'budget', workspaceId, title: 'Reforma', category: 'Casa', targetCents: 200000, status: 'PLANNING' }]
   },
 }
 const app = buildApp({
   workspaceService: new WorkspaceService(workspaces),
   financialCatalog: catalog,
   auth: { async verifyAccessToken(token) {
      if (token === 'owner') return { userId: alice, assuranceLevel: 'aal2' as const }
      if (token === 'viewer') return { userId: viewer, assuranceLevel: 'aal2' as const }
      if (token === 'outsider') return { userId: bob, assuranceLevel: 'aal2' as const }
      if (token === 'password-only') return { userId: alice, assuranceLevel: 'aal1' as const }
      throw new Error('unauthorized')
   }},
   checkDatabase: async () => true,
   allowWorkspaceWrites: false,
 })
 return { app, calls }
}
const pathFor = (kind: string) => '/api/v1/workspaces/' + workspace + '/' + kind

describe('Catálogos financeiros por espaço: isolamento', () => {
 for (const kind of kinds) {
   it(kind + ': bloqueia usuário sem token e token inválido', async () => {
     const { app, calls } = fixture()
     try {
       for (const token of ['', 'invalid']) {
         const res = await app.inject({ method: 'GET', url: pathFor(kind), ...(token ? { headers: { authorization: 'Bearer ' + token } } : {}) })
         expect(res.statusCode).toBe(401)
       }
       expect(calls).toHaveLength(0)
     } finally { await app.close() }
   })
   it(kind + ': bloqueia usuário de outro espaço sem buscar dados', async () => {
     const { app, calls } = fixture()
     try {
       const res = await app.inject({ method: 'GET', url: pathFor(kind), headers: { authorization: 'Bearer outsider' } })
       expect(res.statusCode).toBe(404)
       expect(calls).toHaveLength(0)
     } finally { await app.close() }
   })
   it(kind + ': exige MFA mesmo para OWNER', async () => {
     const { app, calls } = fixture()
     try {
       const res = await app.inject({ method: 'GET', url: pathFor(kind), headers: { authorization: 'Bearer password-only' } })
       expect(res.statusCode).toBe(403)
       expect(calls).toHaveLength(0)
     } finally { await app.close() }
   })
   it(kind + ': permite leitura a VIEWER autorizado com limite controlado', async () => {
     const { app, calls } = fixture()
     try {
       const res = await app.inject({ method: 'GET', url: pathFor(kind) + '?limit=5', headers: { authorization: 'Bearer viewer' } })
       expect(res.statusCode).toBe(200)
       expect(res.json().data).toHaveLength(1)
       expect(res.json().data[0].workspaceId).toBe(workspace)
       expect(res.headers['cache-control']).toContain('no-store')
       expect(calls).toHaveLength(1)
       expect(calls[0]).toContain(workspace + ':5')
     } finally { await app.close() }
   })
   it(kind + ': rejeita limite excessivo e identificador inválido', async () => {
     const { app, calls } = fixture()
     try {
       const headers = { authorization: 'Bearer owner' }
       expect((await app.inject({ method: 'GET', url: pathFor(kind) + '?limit=999999', headers })).statusCode).toBe(400)
       expect((await app.inject({ method: 'GET', url: '/api/v1/workspaces/invalid/' + kind, headers })).statusCode).toBe(404)
       expect(calls).toHaveLength(0)
     } finally { await app.close() }
   })
 }
})
