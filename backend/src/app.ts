import 'dotenv/config'
import Fastify from 'fastify'
import { buildApp } from './presentation/app.js'
import { WorkspaceService } from './application/use-cases/WorkspaceService.js'
import { readConfig } from './shared/config.js'
import type { WorkspaceRepository } from './domain/repositories/WorkspaceRepository.js'
import type { AuthVerifier } from './infrastructure/auth/SupabaseJwtVerifier.js'
import type { PrismaWorkspaceRepository } from './infrastructure/repositories/PrismaWorkspaceRepository.js'
import type { PrismaClient } from '@prisma/client'

// Vercel detecta Fastify diretamente em src/app.ts.
// A rota /health NÃO importa Prisma nem depende de DB ou JWT para iniciar.
console.info('[farol-api] iniciando Fastify')

// Importação dinâmica: a Function de saúde deve continuar respondendo mesmo
// quando a conexão PostgreSQL ou o Prisma falharem. Não logar URLs ou senhas.
let prismaPromise: Promise<PrismaClient> | undefined
function getPrisma(): Promise<PrismaClient> {
  if (!prismaPromise) {
    prismaPromise = import('./infrastructure/database/prisma.js')
      .then(({ createPrismaClient }) => createPrismaClient())
      .catch((error: unknown) => {
        prismaPromise = undefined
        console.error('[farol-api] falha no cliente Prisma:',
          error instanceof Error ? error.name : 'Erro desconhecido')
        throw error
      })
  }
  return prismaPromise
}

let repositoryPromise: Promise<PrismaWorkspaceRepository> | undefined
function getRepository(): Promise<PrismaWorkspaceRepository> {
  if (!repositoryPromise) {
    repositoryPromise = Promise.all([
      getPrisma(),
      import('./infrastructure/repositories/PrismaWorkspaceRepository.js'),
    ]).then(([prisma, { PrismaWorkspaceRepository }]) => new PrismaWorkspaceRepository(prisma))
      .catch((error: unknown) => {
        repositoryPromise = undefined
        throw error
      })
  }
  return repositoryPromise
}

const lazyRepository: WorkspaceRepository = {
  async listForUser(userId) { return (await getRepository()).listForUser(userId) },
  async createOwnedBy(userId, name) { return (await getRepository()).createOwnedBy(userId, name) },
  async hasMembership(userId, workspaceId, allowedRoles) {
    return (await getRepository()).hasMembership(userId, workspaceId, allowedRoles)
  },
}

let verifierPromise: Promise<AuthVerifier> | undefined
function getVerifier(): Promise<AuthVerifier> {
  if (!verifierPromise) {
    verifierPromise = import('./infrastructure/auth/SupabaseJwtVerifier.js')
      .then(({ SupabaseJwtVerifier }) => new SupabaseJwtVerifier(readConfig(process.env).SUPABASE_URL))
      .catch((error: unknown) => {
        verifierPromise = undefined
        console.error('[farol-api] falha na configuração da autenticação:',
          error instanceof Error ? error.name : 'Erro desconhecido')
        throw error
      })
  }
  return verifierPromise
}
const auth: AuthVerifier = {
  async verifyAccessToken(token) { return (await getVerifier()).verifyAccessToken(token) },
}

function corsOrigin(): string | undefined {
  const input = process.env.CORS_ORIGIN ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173')
  if (!input) {
    console.error('[farol-api] CORS_ORIGIN não configurada; acesso cruzado desabilitado')
    return undefined
  }
  try {
    const url = new URL(input)
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      throw new Error('CORS sem HTTPS em produção')
    }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Protocolo inválido')
    return url.origin
  } catch {
    console.error('[farol-api] CORS_ORIGIN inválida; acesso cruzado desabilitado')
    return undefined
  }
}

const app = buildApp({
  auth,
  workspaceService: new WorkspaceService(lazyRepository),
  corsOrigin: corsOrigin(),
  async checkDatabase() {
    // Validação de variáveis e consulta SQL apenas em /ready, nunca em /health.
    readConfig(process.env)
    const prisma = await getPrisma()
    await prisma.$queryRaw`SELECT 1`
    return true
  },
}, Fastify({ logger: false, bodyLimit: 100_000 }))

app.addHook('onClose', async () => {
  if (prismaPromise) {
    const prisma = await prismaPromise.catch(() => null)
    await prisma?.$disconnect()
  }
})

// A Function usa esta instância sem abrir porta; server.ts inicia apenas em modo local.
export default app
