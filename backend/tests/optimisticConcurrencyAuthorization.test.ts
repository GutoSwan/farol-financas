import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import { StaleFinancialRecordError } from '../src/domain/errors/StaleFinancialRecordError.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'
import type { TransactionEntry, TransactionRepository } from '../src/domain/repositories/TransactionRepository.js'
import type { FinancialCatalogMutations } from '../src/domain/repositories/FinancialCatalogMutations.js'

const space = '33333333-3333-4333-8333-333333333333'
const record = '55555555-5555-4555-8555-555555555555'
const turl = '/api/v1/workspaces/' + space + '/transactions/' + record
const auth = { authorization: 'Bearer owner:aal2' }
const v1 = { ...auth, 'if-match': '"1"' }
const v2 = { ...auth, 'if-match': '"2"' }

function fixture() {
  const workspaces: WorkspaceRepository = {
    async listForUser() { return [] },
    async createOwnedBy() { throw Error('unused') },
    async hasMembership(user, workspaceId, roles = []) {
      return workspaceId === space && user === 'owner' && (!roles.length || roles.includes('OWNER'))
    },
  }
  const state = { version: 1, deleted: false, updated: 0, removed: 0 }
  const initial: TransactionEntry = {
    id: record, workspaceId: space, description: 'QA', category: 'QA',
    amountCents: 100, kind: 'EXPENSE', occurredOn: '2026-11-09', version: 1,
  }
  const transactionRepository: TransactionRepository = {
    async listForWorkspace() { return [{ ...initial, version: state.version }] },
    async createForWorkspace() { throw Error('unused') },
    async updateWithinWorkspace(wid, id, changes, expectedVersion) {
      if (wid !== space || id !== record || state.deleted) return null
      if (state.version !== expectedVersion) throw new StaleFinancialRecordError()
      state.version++
      state.updated++
      return { ...initial, ...changes, version: state.version }
    },
    async deleteWithinWorkspace(wid, id, expectedVersion) {
      if (wid !== space || id !== record || state.deleted) return false
      if (state.version !== expectedVersion) throw new StaleFinancialRecordError()
      state.deleted = true
      state.removed++
      return true
    },
  }
  const catalog: FinancialCatalogMutations = {
    async create() { throw Error('unused') },
    async update(input) {
      if (input.workspaceId !== space || input.id !== record || state.deleted) return null
      if (state.version !== input.expectedVersion) throw new StaleFinancialRecordError()
      state.updated++
      state.version++
      return { id: record, workspaceId: space, version: state.version, ...input.data }
    },
    async delete(_kind, wid, id, expectedVersion) {
      if (wid !== space || id !== record || state.deleted) return false
      if (state.version !== expectedVersion) throw new StaleFinancialRecordError()
      state.deleted = true
      state.removed++
      return true
    },
  }
  const app = buildApp({
    workspaceService: new WorkspaceService(workspaces),
    transactionRepository,
    financialCatalogMutations: catalog,
    auth: { async verifyAccessToken(token) {
      if (token === 'owner:aal2') return { userId: 'owner', assuranceLevel: 'aal2' as const }
      if (token === 'owner:aal1') return { userId: 'owner', assuranceLevel: 'aal1' as const }
      if (token === 'intruder:aal2') return { userId: 'intruder', assuranceLevel: 'aal2' as const }
      throw Error('unauthorized')
    }},
    allowWorkspaceWrites: true, // only in-memory unit test
    checkDatabase: async () => true,
  })
  return { app, state }
}

const modules = [
  { url: turl, body: { description: 'Alterado' } },
  { url: '/api/v1/workspaces/' + space + '/recurring-bills/' + record, body: { name: 'Alterado' } },
  { url: '/api/v1/workspaces/' + space + '/fixed-expenses/' + record, body: { name: 'Alterado' } },
  { url: '/api/v1/workspaces/' + space + '/budgets/' + record, body: { title: 'Alterado' } },
]

describe('Controle de versões obrigatório em gravações financeiras', () => {
  for (const mod of modules) {
    it(mod.url + ': segunda edição obsoleta é 409 sem sobrescrever', async () => {
      const { app, state } = fixture()
      try {
        const missing = await app.inject({ method: 'PATCH', url: mod.url, headers: auth, payload: mod.body })
        expect(missing.statusCode).toBe(428)
        const first = await app.inject({ method: 'PATCH', url: mod.url, headers: v1, payload: mod.body })
        expect(first.statusCode).toBe(200)
        expect(first.json().data.version).toBe(2)
        const stale = await app.inject({ method: 'PATCH', url: mod.url, headers: v1, payload: mod.body })
        expect(stale.statusCode).toBe(409)
        expect(stale.json().code).toBe('VERSION_CONFLICT')
        expect(state.updated).toBe(1)
        const success = await app.inject({ method: 'PATCH', url: mod.url, headers: v2, payload: mod.body })
        expect(success.statusCode).toBe(200)
        expect(success.json().data.version).toBe(3)
        expect(state.updated).toBe(2)
      } finally { await app.close() }
    })

    it(mod.url + ': exclusão sem versão ou obsoleta é recusada', async () => {
      const { app, state } = fixture()
      try {
        const missing = await app.inject({ method: 'DELETE', url: mod.url, headers: auth })
        expect(missing.statusCode).toBe(428)
        const invalid = await app.inject({ method: 'DELETE', url: mod.url, headers: { ...auth, 'if-match': '*' } })
        expect(invalid.statusCode).toBe(400)
        const update = await app.inject({ method: 'PATCH', url: mod.url, headers: v1, payload: mod.body })
        expect(update.statusCode).toBe(200)
        const stale = await app.inject({ method: 'DELETE', url: mod.url, headers: v1 })
        expect(stale.statusCode).toBe(409)
        expect(state.removed).toBe(0)
        const deleted = await app.inject({ method: 'DELETE', url: mod.url, headers: v2 })
        expect(deleted.statusCode).toBe(204)
        expect(state.removed).toBe(1)
      } finally { await app.close() }
    })

    it(mod.url + ': 2FA e permissão continuam sendo verificados ANTES da versão', async () => {
      const { app, state } = fixture()
      try {
        const without2fa = await app.inject({ method: 'PATCH', url: mod.url,
          headers: { authorization: 'Bearer owner:aal1' }, payload: mod.body })
        const intruder = await app.inject({ method: 'PATCH', url: mod.url,
          headers: { authorization: 'Bearer intruder:aal2' }, payload: mod.body })
        expect(without2fa.statusCode).toBe(403)
        expect(intruder.statusCode).toBe(404)
        expect(state.updated).toBe(0)
      } finally { await app.close() }
    })
  }
})
