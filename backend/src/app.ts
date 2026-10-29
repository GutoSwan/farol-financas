import 'dotenv/config'
import { createPrismaClient } from './infrastructure/database/prisma.js'
import { PrismaWorkspaceRepository } from './infrastructure/repositories/PrismaWorkspaceRepository.js'
import { SupabaseJwtVerifier } from './infrastructure/auth/SupabaseJwtVerifier.js'
import { WorkspaceService } from './application/use-cases/WorkspaceService.js'
import { readConfig } from './shared/config.js'
import { buildApp } from './presentation/app.js'

// O app é criado uma vez por instância quente da função na Vercel.
// Não iniciamos um servidor TCP na importação, deixando Vercel gerenciar HTTP.
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
})

app.addHook('onClose', async () => { await prisma.$disconnect() })

export default app
