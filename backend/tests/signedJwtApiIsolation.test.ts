import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { buildApp } from '../src/presentation/app.js'
import { SupabaseJwtVerifier } from '../src/infrastructure/auth/SupabaseJwtVerifier.js'
import { WorkspaceService } from '../src/application/use-cases/WorkspaceService.js'
import type { WorkspaceRepository } from '../src/domain/repositories/WorkspaceRepository.js'
import type { TransactionRepository } from '../src/domain/repositories/TransactionRepository.js'
import type { LegacyConnectionService } from '../src/application/use-cases/PrismaLegacyTransactionConnectionService.js'

/**
 * E2E de autorização HTTP local: Fastify recebe JWTs RSA realmente assinados,
 * valida JWKS e sessão, então decide a permissão de cada rota.
 * O JWKS e todos os repositórios são fictícios, em memória: zero Supabase/Prod.
 */
const userA = '11111111-1111-4111-8111-111111111111'
const userViewer = '22222222-2222-4222-8222-222222222222'
const userB = '33333333-3333-4333-8333-333333333333'
const spaceA = '44444444-4444-4444-8444-444444444444'
const spaceB = '55555555-5555-4555-8555-555555555555'
const sessionA = '66666666-6666-4666-8666-666666666666'
const sessionViewer = '77777777-7777-4777-8777-777777777777'
const sessionB = '88888888-8888-4888-8888-888888888888'

type Subject = 'owner' | 'viewer' | 'other'
const subjects = {
  owner: { id: userA, session: sessionA },
  viewer: { id: userViewer, session: sessionViewer },
  other: { id: userB, session: sessionB },
}

const entry = {
  description: 'Gasto fictício', category: 'Teste', amountCents: 987,
  kind: 'EXPENSE' as const, occurredOn: '2026-11-17',
}
const pathA = `/api/v1/workspaces/${spaceA}`
const auth = (value: string) => ({ authorization: `Bearer ${value}` })

let server: Server
let issuer: string
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
let jwk: Awaited<ReturnType<typeof exportJWK>>

beforeAll(async () => {
  const keys = await generateKeyPair('RS256')
  privateKey = keys.privateKey
  jwk = { ...await exportJWK(keys.publicKey), alg: 'RS256', use: 'sig', kid: 'qa-rsa-key' }
  server = createServer((req, res) => {
    if (req.url !== '/auth/v1/.well-known/jwks.json' || req.method !== 'GET') {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ keys: [jwk] }))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth/v1`
})

afterAll(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
})

async function signed(subject: Subject, options: {
  aal?: 'aal1' | 'aal2'; role?: string; issuer?: string;
  audience?: string; session?: string; anonymous?: boolean;
  expired?: boolean; key?: typeof privateKey
} = {}) {
  const who = subjects[subject]
  const jwt = new SignJWT({
    session_id: options.session ?? who.session,
    role: options.role ?? 'authenticated', aal: options.aal ?? 'aal2',
    is_anonymous: options.anonymous ?? false,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'qa-rsa-key' })
    .setSubject(who.id)
    .setIssuer(options.issuer ?? issuer)
    .setAudience(options.audience ?? 'authenticated')
  if (options.expired) jwt.setIssuedAt(1).setExpirationTime(2)
  else jwt.setIssuedAt().setExpirationTime('5m')
  return jwt.sign(options.key ?? privateKey)
}

function makeApp() {
  const active = new Set([sessionA, sessionViewer, sessionB])
  const roles: Record<string, Record<string, 'OWNER'|'EDITOR'|'VIEWER'>> = {
    [userA]: { [spaceA]: 'OWNER' },
    [userViewer]: { [spaceA]: 'VIEWER' },
    [userB]: { [spaceB]: 'OWNER' },
  }
  const records: Record<string, Array<typeof entry & { id: string; workspaceId: string; version: number }>> = {
    [spaceA]: [{ ...entry, id: userA, workspaceId: spaceA, version: 1 }],
    [spaceB]: [{ ...entry, description: 'Outro espaço', id: userB, workspaceId: spaceB, version: 1 }],
  }
  const seen = {
    member: vi.fn(), read: vi.fn(), write: vi.fn(), legacyConnect: vi.fn(),
  }
  const workspaces: WorkspaceRepository = {
    async listForUser(userId) {
      return Object.entries(roles[userId] ?? {}).map(([id, role]) =>
        ({ id, name: id === spaceA ? 'Casa QA' : 'Outro QA', role }))
    },
    async createOwnedBy() { throw new Error('Não executar criação no teste.') },
    async hasMembership(userId, workspaceId, allowedRoles = []) {
      seen.member(userId, workspaceId, allowedRoles)
      const role = roles[userId]?.[workspaceId]
      return !!role && (!allowedRoles.length || allowedRoles.includes(role))
    },
  }
  const transactions: TransactionRepository = {
    async listForWorkspace(workspaceId) {
      seen.read(workspaceId)
      return records[workspaceId] ?? []
    },
    async createForWorkspace(input) {
      seen.write(input.workspaceId)
      const saved = { ...input, id: userViewer, version: 1 }
      records[input.workspaceId].push(saved)
      return saved
    },
    async updateWithinWorkspace() { throw Error('PATCH fora de escopo deste cenário.') },
    async deleteWithinWorkspace() { throw Error('DELETE fora de escopo deste cenário.') },
  }
  const legacy: LegacyConnectionService = {
    async connect(userId, workspaceId) {
      seen.legacyConnect(userId, workspaceId)
      return { status: 'completed', workspaceMapping: 'created', created: 0, reused: 0, total: 0 }
    },
  }
  const checker = vi.fn(async (userId: string, sessionId: string) => ({
    active: active.has(sessionId) && Object.values(subjects)
      .some(person => person.id === userId && person.session === sessionId),
    mfaRequired: true,
  }))
  const verifier = new SupabaseJwtVerifier(issuer.replace(/\/auth\/v1$/, ''), checker)
  const app = buildApp({
    auth: verifier, workspaceService: new WorkspaceService(workspaces),
    transactionRepository: transactions,
    legacyConnectionService: legacy,
    allowWorkspaceWrites: true, allowLegacyConnectionWrites: true,
    checkDatabase: async () => true,
  })
  return { app, active, checker, seen, records }
}

describe('JWT RSA assinado + sessão ativa + autorização HTTP por papel', () => {
  it('rejeita assinatura falsa, emissor, público-alvo, expiração e claims inválidas', async () => {
    const { app, checker, seen } = makeApp()
    try {
      const forged = await generateKeyPair('RS256')
      const tokens = [
        await signed('owner', { key: forged.privateKey }),
        await signed('owner', { issuer: 'https://servidor-estranho.example/auth/v1' }),
        await signed('owner', { audience: 'outro-publico' }),
        await signed('owner', { expired: true }),
        await signed('owner', { role: 'service_role' }),
        await signed('owner', { anonymous: true }),
        await signed('owner', { session: 'sessao-malformada' }),
      ]
      for (const token of tokens) {
        const response = await app.inject({ method: 'GET', url: pathA + '/transactions', headers: auth(token) })
        expect(response.statusCode).toBe(401)
        expect(response.body).not.toContain('Gasto fictício')
      }
      expect(seen.member).not.toHaveBeenCalled()
      expect(seen.read).not.toHaveBeenCalled()
      // Claims inválidas são negadas antes mesmo da consulta de sessão.
      expect(checker).not.toHaveBeenCalled()
    } finally { await app.close() }
  })

  it('bloqueia token já assinado quando a sessão é revogada, sem tocar no repositório', async () => {
    const { app, active, seen } = makeApp()
    try {
      const token = await signed('owner')
      const initial = await app.inject({ method: 'GET', url: pathA + '/transactions', headers: auth(token) })
      expect(initial.statusCode).toBe(200)
      active.delete(sessionA)
      const afterLogout = await app.inject({ method: 'GET', url: pathA + '/transactions', headers: auth(token) })
      expect(afterLogout.statusCode).toBe(401)
      expect(seen.read).toHaveBeenCalledTimes(1)
    } finally { await app.close() }
  })

  it('AAL1 é bloqueado com MFA, mesmo com JWT válido; AAL2 funciona', async () => {
    const { app, seen } = makeApp()
    try {
      const passwordOnly = await signed('owner', { aal: 'aal1' })
      const passwordResponse = await app.inject({ method: 'GET', url: pathA + '/transactions', headers: auth(passwordOnly) })
      expect(passwordResponse.statusCode).toBe(403)
      expect(seen.member).not.toHaveBeenCalled()
      const complete = await app.inject({ method: 'GET', url: pathA + '/transactions', headers: auth(await signed('owner')) })
      expect(complete.statusCode).toBe(200)
    } finally { await app.close() }
  })

  it('OWNER sem AAL2 nunca dispara a migração, mesmo se a rota estiver habilitada localmente', async () => {
    const { app, seen } = makeApp()
    try {
      const response = await app.inject({
        method: 'POST', url: pathA + '/legacy-connect',
        headers: auth(await signed('owner', { aal: 'aal1' })), payload: {},
      })
      expect(response.statusCode).toBe(403)
      expect(seen.legacyConnect).not.toHaveBeenCalled()
    } finally { await app.close() }
  })

  it('dono A e dono B só recebem os próprios registros, mesmo com UUID alheio conhecido', async () => {
    const { app, seen } = makeApp()
    try {
      const a = auth(await signed('owner'))
      const b = auth(await signed('other'))
      for (const [headers, own, foreign] of [[a, spaceA, spaceB], [b, spaceB, spaceA]] as const) {
        const ownResponse = await app.inject({ method: 'GET', url: `/api/v1/workspaces/${own}/transactions`, headers })
        expect(ownResponse.statusCode).toBe(200)
        expect(ownResponse.json().data[0].workspaceId).toBe(own)
        const before = seen.read.mock.calls.length
        const forbidden = await app.inject({ method: 'GET', url: `/api/v1/workspaces/${foreign}/transactions`, headers })
        expect(forbidden.statusCode).toBe(404)
        expect(seen.read).toHaveBeenCalledTimes(before)
      }
    } finally { await app.close() }
  })

  it('VIEWER lê seu espaço, mas não altera e não inicia migração; somente OWNER AAL2 inicia', async () => {
    const { app, seen, records } = makeApp()
    try {
      const viewer = auth(await signed('viewer'))
      const owner = auth(await signed('owner'))
      const other = auth(await signed('other'))
      const allowedRead = await app.inject({ method: 'GET', url: pathA + '/transactions', headers: viewer })
      expect(allowedRead.statusCode).toBe(200)
      for (const headers of [viewer, other]) {
        const forbiddenWrite = await app.inject({ method: 'POST', url: pathA + '/transactions', headers, payload: entry })
        expect(forbiddenWrite.statusCode).toBe(404)
        const forbiddenConnect = await app.inject({ method: 'POST', url: pathA + '/legacy-connect', headers, payload: {} })
        expect(forbiddenConnect.statusCode).toBe(404)
      }
      expect(records[spaceA]).toHaveLength(1)
      expect(seen.write).not.toHaveBeenCalled()
      expect(seen.legacyConnect).not.toHaveBeenCalled()
      const created = await app.inject({ method: 'POST', url: pathA + '/transactions', headers: owner, payload: entry })
      expect(created.statusCode).toBe(201)
      expect(records[spaceA]).toHaveLength(2)
      const connected = await app.inject({ method: 'POST', url: pathA + '/legacy-connect', headers: owner, payload: {} })
      expect(connected.statusCode).toBe(200)
      expect(seen.legacyConnect).toHaveBeenCalledExactlyOnceWith(userA, spaceA)
    } finally { await app.close() }
  })
})
