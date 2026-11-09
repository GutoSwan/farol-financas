import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'
import type { FinancialCatalogMutations, CatalogCreate, CatalogUpdate, CatalogKind } from '../src/domain/repositories/FinancialCatalogMutations.js'

const space = '33333333-3333-4333-8333-333333333333'
const rec = '55555555-5555-4555-8555-555555555555'
const kinds = ['recurring-bills', 'fixed-expenses', 'budgets'] as const
const payload = {
  'recurring-bills': { name: 'Energia', dueDay: 10 },
  'fixed-expenses': { name: 'Internet', amountCents: 8500, dueDay: 15, startMonth: '2026-11' },
  budgets: { title: 'Reforma', category: 'Casa', targetCents: 100000 },
}
function makeFixture(writes = true) {
 const calls: string[] = []
 const workspaceRepo: WorkspaceRepository = {
  async listForUser() { return [] },
  async createOwnedBy() { throw Error('unused') },
  async hasMembership(userId, workspaceId, roles = []) {
    const role = userId === 'owner' ? 'OWNER' : userId === 'editor' ? 'EDITOR' : userId === 'viewer' ? 'VIEWER' : undefined
    return workspaceId === space && !!role && (!roles.length || roles.includes(role))
  },
 }
 const mutations: FinancialCatalogMutations = {
   async create(input: CatalogCreate) { calls.push('create:' + input.kind + ':' + input.workspaceId); return { id: rec, ...input.data } },
   async update(input: CatalogUpdate) { calls.push('update:' + input.kind + ':' + input.workspaceId); return input.id === rec ? { id: rec, ...input.data } : null },
   async delete(kind: CatalogKind, workspaceId: string, id: string) { calls.push('delete:' + kind + ':' + workspaceId); return id === rec },
 }
 const app = buildApp({
   workspaceService: new WorkspaceService(workspaceRepo),
   financialCatalogMutations: mutations,
   auth: { async verifyAccessToken(token) {
     if (token === 'owner' || token === 'editor' || token === 'viewer' || token === 'outsider') {
       return { userId: token, assuranceLevel: 'aal2' as const }
     }
     if (token === 'password') return { userId: 'owner', assuranceLevel: 'aal1' as const }
     throw Error('unauthorized')
   }},
   allowWorkspaceWrites: writes,
   checkDatabase: async () => true,
 })
 return { app, calls }
}
function address(kind: string, path = '') { return '/api/v1/workspaces/' + space + '/' + kind + path }
describe('Escritas financeiras: autorização de contas, gastos e orçamentos', () => {
 for (const kind of kinds) {
   for (const method of ['POST','PATCH','DELETE'] as const) {
     const path = address(kind, method === 'POST' ? '' : '/' + rec)
     const body = method === 'POST' ? payload[kind] : { ...(kind === 'budgets' ? { title: 'Atualizado' } : { name: 'Atualizado' }) }
     it(kind + ' ' + method + ': nega anônimo e invasor', async () => {
       const { app, calls } = makeFixture()
       try {
         for (const token of ['', 'outsider']) {
           const res = await app.inject({ method, url: path, ...(token ? { headers: { authorization: 'Bearer ' + token } } : {}), ...(method !== 'DELETE' ? { payload: body } : {}) })
           expect(res.statusCode).toBe(token ? 404 : 401)
         }
         expect(calls).toHaveLength(0)
       } finally { await app.close() }
     })
     it(kind + ' ' + method + ': nega VIEWER e AAL1', async () => {
       const { app, calls } = makeFixture()
       try {
         for (const token of ['viewer', 'password']) {
           const res = await app.inject({ method, url: path, headers: { authorization: 'Bearer ' + token }, ...(method !== 'DELETE' ? { payload: body } : {}) })
           expect(res.statusCode).toBe(token === 'viewer' ? 404 : 403)
         }
         expect(calls).toHaveLength(0)
       } finally { await app.close() }
     })
     it(kind + ' ' + method + ': Preview nega até OWNER', async () => {
       const { app, calls } = makeFixture(false)
       try {
         const res = await app.inject({ method, url: path, headers: { authorization: 'Bearer owner' }, ...(method !== 'DELETE' ? { payload: body } : {}) })
         expect(res.statusCode).toBe(403)
         expect(calls).toHaveLength(0)
       } finally { await app.close() }
     })
     it(kind + ' ' + method + ': permite EDITOR autorizado', async () => {
       const { app, calls } = makeFixture()
       try {
         const res = await app.inject({ method, url: path, headers: { authorization: 'Bearer editor', 'if-match': '"1"' }, ...(method !== 'DELETE' ? { payload: body } : {}) })
         expect(res.statusCode).toBe(method === 'POST' ? 201 : method === 'PATCH' ? 200 : 204)
         expect(calls).toEqual([method.toLowerCase().replace('post','create').replace('patch','update') + ':' + kind + ':' + space])
       } finally { await app.close() }
     })
   }
   it(kind + ': rejeita campos externos e PATCH vazio', async () => {
     const { app, calls } = makeFixture()
     try {
       const headers = { authorization: 'Bearer owner' }
       const a = await app.inject({ method: 'POST', url: address(kind), headers, payload: { ...payload[kind], workspaceId: 'other' } })
       const b = await app.inject({ method: 'PATCH', url: address(kind, '/' + rec), headers, payload: {} })
       expect(a.statusCode).toBe(400)
       expect(b.statusCode).toBe(400)
       expect(calls).toHaveLength(0)
     } finally { await app.close() }
   })
 }
})
