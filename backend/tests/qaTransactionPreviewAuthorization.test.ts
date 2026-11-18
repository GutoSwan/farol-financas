import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/presentation/app.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { TransactionRepository, TransactionEntry } from '../src/domain/repositories/TransactionRepository.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'
import { StaleFinancialRecordError } from '../src/domain/errors/StaleFinancialRecordError.js'
import { isVerifiedQaTransactionWriteEnvironment } from '../src/infrastructure/security/environmentIsolation.js'

const ref = 'tvirkrjkgdtybtcundon'
const db = 'aws-1-sa-east-1.pooler.supabase.com'
const baseEnv = {
  VERCEL_ENV: 'preview',
  FAROL_DEV_SUPABASE_REF: ref,
  SUPABASE_URL: 'https://' + ref + '.supabase.co',
  DATABASE_URL: 'postgresql://farol_preview_sync_ro.' + ref +
    ':test-only-reader-password-123456789@' + db + ':6543/postgres',
  FAROL_QA_TRANSACTION_DATABASE_URL: 'postgresql://farol_preview_sync_transactions_rw.' + ref +
    ':test-only-writer-password-123456789@' + db + ':6543/postgres',
  FAROL_PREVIEW_ADMIN_QA_READONLY: 'true',
  FAROL_PREVIEW_SYNC_QA_READONLY: 'true',
  FAROL_PREVIEW_SYNC_QA_TRANSACTION_WRITES: 'true',
  FAROL_FINANCIAL_WRITES_ENABLED: 'false',
  FAROL_INVOICE_UPLOADS_ENABLED: 'false',
}
const qa = '01c6765f-b873-420f-a5f2-68c54aa22500'
const normal = '44444444-4444-4444-8444-444444444444'
const namedButForeign = '33333333-3333-4333-8333-333333333333'
const recordId = '55555555-5555-4555-8555-555555555555'
const transactionBody = { description: 'Feira', category: 'QA', amountCents: 123,
  kind: 'INCOME', occurredOn: '2026-11-16' }
const url = '/api/v1/workspaces/' + qa + '/transactions'

function setup(qaName = 'QA - Casa compartilhada (Dev)', qaId = qa) {
  const writes: string[] = []
  const roles = { a: 'OWNER', b: 'EDITOR', viewer: 'VIEWER' } as const
  const workspaces: WorkspaceRepository = {
    async listForUser(userId) {
      if (!(userId in roles)) return []
      return [
        { id: qaId, name: qaName, role: roles[userId as keyof typeof roles] },
        { id: normal, name: 'Gustavo e Ana', role: 'OWNER' as const },
      ]
    },
    async createOwnedBy() { throw Error('Nunca criar espaço QA pelo teste') },
    async hasMembership(userId, workspaceId, allowed = []) {
      if (!(userId in roles)) return false
      const role = workspaceId === qaId
        ? roles[userId as keyof typeof roles]
        : workspaceId === normal ? 'OWNER' : null
      return !!role && (!allowed.length || allowed.includes(role))
    },
  }
  let version = 1
  const item: TransactionEntry = {
    id: recordId, workspaceId: qa, description: 'Feira', category: 'QA',
    amountCents: 123, kind: 'INCOME', occurredOn: '2026-11-16', version: 1,
  }
  const writer: TransactionRepository = {
    async listForWorkspace() { throw Error('Leituras devem usar papel RO') },
    async createForWorkspace(entry) {
      writes.push('create:' + entry.workspaceId)
      return { ...item, ...entry, version: 1 }
    },
    async updateWithinWorkspace(workspaceId, id, changes, expectedVersion) {
      if (expectedVersion !== version) throw new StaleFinancialRecordError()
      version++
      writes.push('update:' + workspaceId + ':' + id)
      return { ...item, ...changes, version }
    },
    async deleteWithinWorkspace(workspaceId, id, expectedVersion) {
      if (expectedVersion !== version) throw new StaleFinancialRecordError()
      writes.push('delete:' + workspaceId + ':' + id)
      return true
    },
  }
  const app = buildApp({
    auth: { async verifyAccessToken(token) {
      if (!['a','b','viewer'].includes(token)) throw Error('token inválido')
      return { userId: token, assuranceLevel: 'aal1' as const, mfaRequired: false }
    }},
    workspaceService: new WorkspaceService(workspaces),
    transactionRepository: { ...writer, async createForWorkspace() { throw Error('Não usar RO na gravação') } },
    qaTransactionRepository: writer,
    allowWorkspaceWrites: false,
    allowQaTransactionWrites: true,
    checkDatabase: async () => true,
  })
  return { app, writes }
}
describe('Preview QA: somente lançamentos fictícios e privilégio mínimo', () => {
  it('aceita Dev reader RO + writer de QA, rejeita Produção e role inadequada', () => {
    expect(isVerifiedQaTransactionWriteEnvironment(baseEnv)).toBe(true)
    expect(isVerifiedQaTransactionWriteEnvironment({ ...baseEnv, VERCEL_ENV: 'production' })).toBe(false)
    expect(isVerifiedQaTransactionWriteEnvironment({ ...baseEnv, SUPABASE_URL: 'https://xwzbcabyjhmgggbkaxvt.supabase.co' })).toBe(false)
    expect(isVerifiedQaTransactionWriteEnvironment({ ...baseEnv, FAROL_FINANCIAL_WRITES_ENABLED: 'true' })).toBe(false)
    expect(isVerifiedQaTransactionWriteEnvironment({ ...baseEnv, FAROL_PREVIEW_SYNC_QA_TRANSACTION_WRITES: 'false' })).toBe(false)
    expect(isVerifiedQaTransactionWriteEnvironment({ ...baseEnv, FAROL_QA_TRANSACTION_DATABASE_URL: baseEnv.DATABASE_URL })).toBe(false)
    expect(isVerifiedQaTransactionWriteEnvironment({ ...baseEnv, FAROL_QA_TRANSACTION_DATABASE_URL: baseEnv.FAROL_QA_TRANSACTION_DATABASE_URL.replace(db, 'evil.test') })).toBe(false)
  })

  it('OWNER e EDITOR gravam apenas em QA; VIEWER e espaço real não gravam', async () => {
    const { app, writes } = setup()
    try {
      for (const token of ['a','b']) {
        const response = await app.inject({ method: 'POST', url,
          headers: { authorization: 'Bearer ' + token }, payload: transactionBody })
        expect(response.statusCode).toBe(201)
      }
      const viewer = await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer viewer' }, payload: transactionBody })
      const real = await app.inject({ method: 'POST',
        url: '/api/v1/workspaces/' + normal + '/transactions',
        headers: { authorization: 'Bearer a' }, payload: transactionBody })
      expect(viewer.statusCode).toBe(404)
      expect(real.statusCode).toBe(404)
      expect(writes).toEqual(['create:' + qa, 'create:' + qa])
    } finally { await app.close() }
  })

  it('nome QA parecido não autoriza escrita', async () => {
    const { app, writes } = setup('QA - Valora3D parecida')
    try {
      const response = await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer a' }, payload: transactionBody })
      expect(response.statusCode).toBe(404)
      expect(writes).toEqual([])
    } finally { await app.close() }
  })

  it('nome QA exato em UUID não autorizado também não concede escrita', async () => {
    const { app, writes } = setup('QA - Casa compartilhada (Dev)', namedButForeign)
    try {
      const response = await app.inject({ method: 'POST',
        url: '/api/v1/workspaces/' + namedButForeign + '/transactions',
        headers: { authorization: 'Bearer a' }, payload: transactionBody })
      expect(response.statusCode).toBe(404)
      expect(writes).toEqual([])
    } finally { await app.close() }
  })

  it('edição concorrente com versão antiga recusa 409 e exige If-Match', async () => {
    const { app, writes } = setup()
    try {
      const editUrl = url + '/' + recordId
      const missing = await app.inject({ method: 'PATCH', url: editUrl,
        headers: { authorization: 'Bearer a' }, payload: { description: 'Alterado' } })
      expect(missing.statusCode).toBe(428)
      const good = await app.inject({ method: 'PATCH', url: editUrl,
        headers: { authorization: 'Bearer a', 'if-match': '"1"' }, payload: { description: 'Alterado' } })
      expect(good.statusCode).toBe(200)
      const stale = await app.inject({ method: 'DELETE', url: editUrl,
        headers: { authorization: 'Bearer b', 'if-match': '"1"' } })
      expect(stale.statusCode).toBe(409)
      expect(writes).toEqual(['update:' + qa + ':' + recordId])
    } finally { await app.close() }
  })
})
