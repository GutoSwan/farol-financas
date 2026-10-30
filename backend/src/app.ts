import 'dotenv/config'
import Fastify from 'fastify'
import { createPrismaClient } from './infrastructure/database/prisma.js'
import { PrismaWorkspaceRepository } from './infrastructure/repositories/PrismaWorkspaceRepository.js'
import { SupabaseJwtVerifier } from './infrastructure/auth/SupabaseJwtVerifier.js'
import { WorkspaceService } from './application/use-cases/WorkspaceService.js'
import { readConfig } from './shared/config.js'
import { buildApp } from './presentation/app.js'

// A Vercel encontra o import e a criação explícita de Fastify neste entrypoint.
// O framework preset 'fastify' é fixado em backend/vercel.json para evitar
// que o projeto antigo com preset Other produza deploy estático e erro 404.

const config = readConfig(process.env)
const prisma = createPrismaClient()
const app = buildApp({
  auth: new SupabaseJwtVerifier(config.SUPABASE_URL),
  workspaceService: new WorkspaceService(new PrismaWorkspaceRepository(prisma)),
  corsOrigin: config.CORS_ORIGIN,
  async checkDatabase() {
    await prisma.$queryRaw`SELECT 1`
    return true
  },
}, Fastify({ logger: false, bodyLimit: 100_000 }))

app.addHook('onClose', async () => { await prisma.$disconnect() })

// O ponto de entrada que a Vercel reconhece precisa iniciar Fastify com listen().
// No desenvolvimento o servidor independente chama listen() em src/server.ts.
if (process.env.VERCEL === '1') {
  void app.listen({ port: config.PORT, host: '0.0.0.0' }).catch((error: unknown) => {
    console.error('Falha ao iniciar API Fastify na Vercel:', error instanceof Error ? error.message : 'Erro desconhecido.')
  })
}

export default app
