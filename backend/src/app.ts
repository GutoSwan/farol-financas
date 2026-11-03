import 'dotenv/config'
import Fastify from 'fastify'
import { createPrismaClient } from './infrastructure/database/prisma.js'
import { PrismaWorkspaceRepository } from './infrastructure/repositories/PrismaWorkspaceRepository.js'
import { SupabaseJwtVerifier } from './infrastructure/auth/SupabaseJwtVerifier.js'
import { WorkspaceService } from './application/use-cases/WorkspaceService.js'
import { readConfig } from './shared/config.js'
import { buildApp } from './presentation/app.js'

// A Vercel reconhece src/app.ts e encaminha requisições a uma única Function.
// Logs de inicialização registram SOMENTE etapas, sem credenciais ou URLs privadas.
console.info('[farol-api] inicio da inicializacao')

const config = (() => {
  try {
    const parsed = readConfig(process.env)
    console.info('[farol-api] configuracao validada')
    return parsed
  } catch (error) {
    // readConfig expõe somente os NOMES das configurações inválidas.
    console.error('[farol-api] falha na configuracao:',
      error instanceof Error ? error.message : 'Erro de configuracao desconhecido')
    throw error
  }
})()

const prisma = (() => {
  try {
    const client = createPrismaClient()
    console.info('[farol-api] prisma inicializado (conexao ainda nao testada)')
    return client
  } catch (error) {
    console.error('[farol-api] falha ao criar cliente Prisma:',
      error instanceof Error ? error.name : 'Erro desconhecido')
    throw error
  }
})()

const app = (() => {
  try {
    const instance = buildApp({
      auth: new SupabaseJwtVerifier(config.SUPABASE_URL),
      workspaceService: new WorkspaceService(new PrismaWorkspaceRepository(prisma)),
      corsOrigin: config.CORS_ORIGIN,
      async checkDatabase() {
        await prisma.$queryRaw`SELECT 1`
        return true
      },
    }, Fastify({ logger: false, bodyLimit: 100_000 }))
    instance.addHook('onClose', async () => { await prisma.$disconnect() })
    console.info('[farol-api] rotas Fastify registradas')
    return instance
  } catch (error) {
    console.error('[farol-api] falha ao registrar Fastify:',
      error instanceof Error ? error.name : 'Erro desconhecido')
    throw error
  }
})()

// A chamada listen é sempre executada, como exige a integração Fastify/Vercel.
// No desenvolvimento, host/porta vêm do backend/.env. Na Vercel, a Function
// intercepta o servidor e recebe as requisições sem um processo TCP persistente.
const host = process.env.VERCEL === '1' ? '0.0.0.0' : config.HOST
console.info('[farol-api] iniciando listen')
void app.listen({ port: config.PORT, host }).then(() => {
  console.info('[farol-api] Fastify inicializado')
}).catch((error: unknown) => {
  console.error('[farol-api] falha no listen:',
    error instanceof Error ? error.name : 'Erro desconhecido')
  // Falhar explicitamente: nunca mascarar um servidor que nao iniciou.
  process.exitCode = 1
})

export default app
