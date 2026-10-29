import 'dotenv/config'
import { createPrismaClient } from './infrastructure/database/prisma.js'
import { PrismaWorkspaceRepository } from './infrastructure/repositories/PrismaWorkspaceRepository.js'
import { SupabaseJwtVerifier } from './infrastructure/auth/SupabaseJwtVerifier.js'
import { WorkspaceService } from './application/use-cases/WorkspaceService.js'
import { readConfig } from './shared/config.js'
import { buildApp } from './presentation/app.js'

async function main() {
  const config = readConfig(process.env)
  const prisma = createPrismaClient()
  const app = buildApp({
    auth: new SupabaseJwtVerifier(config.SUPABASE_URL),
    workspaceService: new WorkspaceService(new PrismaWorkspaceRepository(prisma)),
    async checkDatabase() {
      await prisma.$queryRaw`SELECT 1`
      return true
    },
  })

  app.addHook('onClose', async () => { await prisma.$disconnect() })
  await app.listen({ port: config.PORT, host: config.HOST })
  app.log.info(`Farol API ouvindo em http://${config.HOST}:${config.PORT}`)
  process.stdout.write(`Farol API em http://${config.HOST}:${config.PORT}\n`)
}

main().catch((error: unknown) => {
  console.error('Não foi possível iniciar a API:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
