import 'dotenv/config'
import Fastify from 'fastify'
import { buildApp } from './presentation/app.js'
import { WorkspaceService } from './application/use-cases/WorkspaceService.js'
import { readConfig } from './shared/config.js'
import type { WorkspaceRepository } from './domain/repositories/WorkspaceRepository.js'
import type { TransactionRepository } from './domain/repositories/TransactionRepository.js'
import type { FinancialCatalogRepository } from './domain/repositories/FinancialCatalogRepository.js'
import type { FinancialCatalogMutations } from './domain/repositories/FinancialCatalogMutations.js'
import type { InvoiceRepository } from './domain/repositories/InvoiceRepository.js'
import { isVerifiedDevPreviewEnvironment } from './infrastructure/security/environmentIsolation.js'
import { DevAuthOnlyQaVerifier, isVerifiedAuthOnlyDevPreview } from './infrastructure/auth/DevAuthOnlyQaVerifier.js'
import type { PrismaTransactionRepository } from './infrastructure/repositories/PrismaTransactionRepository.js'
import type { LegacyConnectionService } from './application/use-cases/PrismaLegacyTransactionConnectionService.js'
import type { LegacyReadinessInspector } from './application/use-cases/LegacyReadinessInspector.js'
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

let transactionRepositoryPromise: Promise<PrismaTransactionRepository> | undefined
function getTransactionRepository(): Promise<PrismaTransactionRepository> {
  if (!transactionRepositoryPromise) {
    transactionRepositoryPromise = Promise.all([
      getPrisma(),
      import('./infrastructure/repositories/PrismaTransactionRepository.js'),
    ]).then(([prisma, { PrismaTransactionRepository }]) => new PrismaTransactionRepository(prisma))
      .catch((error: unknown) => {
        transactionRepositoryPromise = undefined
        throw error
      })
  }
  return transactionRepositoryPromise
}

const lazyTransactions: TransactionRepository = {
  async listForWorkspace(workspaceId, limit) {
    return (await getTransactionRepository()).listForWorkspace(workspaceId, limit)
  },
  async createForWorkspace(entry) {
    return (await getTransactionRepository()).createForWorkspace(entry)
  },
  async updateWithinWorkspace(workspaceId, transactionId, changes, expectedVersion) {
    return (await getTransactionRepository()).updateWithinWorkspace(workspaceId, transactionId, changes, expectedVersion)
  },
  async deleteWithinWorkspace(workspaceId, transactionId, expectedVersion) {
    return (await getTransactionRepository()).deleteWithinWorkspace(workspaceId, transactionId, expectedVersion)
  },
}

let catalogPromise: Promise<FinancialCatalogRepository> | undefined
function getCatalog(): Promise<FinancialCatalogRepository> {
  if (!catalogPromise) {
    catalogPromise = Promise.all([
      getPrisma(),
      import('./infrastructure/repositories/PrismaFinancialCatalogRepository.js'),
    ]).then(([prisma, { PrismaFinancialCatalogRepository }]) => new PrismaFinancialCatalogRepository(prisma))
      .catch((error: unknown) => { catalogPromise = undefined; throw error })
  }
  return catalogPromise
}
const lazyCatalog: FinancialCatalogRepository = {
  async listRecurringBills(workspaceId, limit) {
    return (await getCatalog()).listRecurringBills(workspaceId, limit)
  },
  async listFixedExpenses(workspaceId, limit) {
    return (await getCatalog()).listFixedExpenses(workspaceId, limit)
  },
  async listBudgets(workspaceId, limit) {
    return (await getCatalog()).listBudgets(workspaceId, limit)
  },
}

let mutationsPromise: Promise<FinancialCatalogMutations> | undefined
function getMutations(): Promise<FinancialCatalogMutations> {
  if (!mutationsPromise) {
    mutationsPromise = Promise.all([
      getPrisma(),
      import('./infrastructure/repositories/PrismaFinancialCatalogMutations.js'),
    ]).then(([prisma, { PrismaFinancialCatalogMutations }]) => new PrismaFinancialCatalogMutations(prisma))
      .catch((error: unknown) => { mutationsPromise = undefined; throw error })
  }
  return mutationsPromise
}
const lazyMutations: FinancialCatalogMutations = {
  async create(input) { return (await getMutations()).create(input) },
  async update(input) { return (await getMutations()).update(input) },
  async delete(kind, workspaceId, id, expectedVersion) { return (await getMutations()).delete(kind, workspaceId, id, expectedVersion) },
}

// Instância lazy: a migração permanece desligada; /health não abre o DB.
const lazyLegacyConnection: LegacyConnectionService = {
  async connect(ownerUserId, workspaceId, data) {
    const [prisma, module] = await Promise.all([
      getPrisma(), import('./application/use-cases/PrismaLegacyTransactionConnectionService.js'),
    ])
    return new module.PrismaLegacyTransactionConnectionService(prisma).connect(ownerUserId,workspaceId,data)
  },
}

// A leitura exata só inicializa Prisma quando o usuário solicita a conferência.
const lazyReadiness: LegacyReadinessInspector = {
  async inspect(ownerUserId, workspaceId) {
    const [prisma, { PrismaLegacyReadinessInspector }] = await Promise.all([
      getPrisma(), import('./infrastructure/repositories/PrismaLegacyReadinessInspector.js'),
    ])
    return new PrismaLegacyReadinessInspector(prisma).inspect(ownerUserId, workspaceId)
  },
}

let invoiceRepositoryPromise: Promise<InvoiceRepository> | undefined
function getInvoiceRepository(): Promise<InvoiceRepository> {
  if (!invoiceRepositoryPromise) {
    invoiceRepositoryPromise = Promise.all([
      getPrisma(),
      import('./infrastructure/repositories/SupabaseEncryptedInvoiceRepository.js'),
    ]).then(([prisma, { SupabaseEncryptedInvoiceRepository }]) => new SupabaseEncryptedInvoiceRepository(prisma))
      .catch((error: unknown) => { invoiceRepositoryPromise = undefined; throw error })
  }
  return invoiceRepositoryPromise
}
const lazyInvoices: InvoiceRepository = {
  async create(input) { return (await getInvoiceRepository()).create(input) },
  async listPersonal(workspaceId, uploadedBy) {
    return (await getInvoiceRepository()).listPersonal(workspaceId, uploadedBy)
  },
}

let verifierPromise: Promise<AuthVerifier> | undefined
function getVerifier(): Promise<AuthVerifier> {
  if (!verifierPromise) {
    verifierPromise = import('./infrastructure/auth/SupabaseJwtVerifier.js')
      .then(({ SupabaseJwtVerifier }) => new SupabaseJwtVerifier(
        readConfig(process.env).SUPABASE_URL,
        async (userId, sessionId) => {
          // Somente o servidor consulta auth.sessions; não expor service_role no frontend.
          // Query parametrizada, que bloqueia o JWT após logout/remoção da conta.
          const prisma = await getPrisma()
          // A conta técnica Dev NÃO recebe acesso direto às tabelas auth.
          // Uma função PRIVADA, restrita a esse papel, devolve apenas true/false.
          if (process.env.FAROL_PREVIEW_ADMIN_QA_READONLY === 'true') {
            const flags = await prisma.$queryRaw<Array<{ active: boolean }>>`
              SELECT farol_qa_private.is_active_session(${userId}::uuid, ${sessionId}::uuid) AS active
            `
            return flags.length === 1 && flags[0].active === true
          }
          const rows = await prisma.$queryRaw<Array<{ active: boolean }>>`
            SELECT EXISTS (
              SELECT 1 FROM auth.sessions s
              INNER JOIN auth.users u ON u.id = s.user_id
              WHERE s.id = ${sessionId}::uuid
                AND s.user_id = ${userId}::uuid
                AND (s.not_after IS NULL OR s.not_after > NOW())
                AND u.deleted_at IS NULL
                AND (u.banned_until IS NULL OR u.banned_until <= NOW())
                AND u.is_anonymous IS NOT TRUE
            ) AS active
          `
          return rows.length === 1 && rows[0].active === true
        },
      ))
      .catch((error: unknown) => {
        verifierPromise = undefined
        console.error('[farol-api] falha na configuração da autenticação:',
          error instanceof Error ? error.name : 'Erro desconhecido')
        throw error
      })
  }
  return verifierPromise
}
const authOnlyQa = process.env.FAROL_PREVIEW_ADMIN_QA_AUTH_ONLY === 'true'
const qaVerifier = authOnlyQa
  ? new DevAuthOnlyQaVerifier(process.env.SUPABASE_PUBLISHABLE_KEY ?? '')
  : null

const auth: AuthVerifier = {
  async verifyAccessToken(token) {
    if (authOnlyQa) {
      if (!isVerifiedAuthOnlyDevPreview(process.env) || !qaVerifier) {
        throw new Error('Preview de teste isolada não configurada.')
      }
      return qaVerifier.verifyAccessToken(token)
    }
    return (await getVerifier()).verifyAccessToken(token)
  },
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

// Register the security hook BEFORE buildApp registers HTTP routes.
// Fastify hooks added after route creation do not protect earlier routes.
const guardedFastify = Fastify({ logger: false, bodyLimit: 100_000 })
guardedFastify.addHook('onRequest', async (request, reply) => {
  const path = request.url.split('?')[0]
  if (authOnlyQa) {
    // Nunca usar credenciais globais de banco quando este modo estiver ativo.
    if (!isVerifiedAuthOnlyDevPreview(process.env)) {
      return reply.code(503).send({ error: 'Preview Dev não isolada.' })
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return reply.code(403).send({ error: 'Teste somente leitura.' })
    }
    if (!['/api/v1/health', '/api/v1/ready', '/api/v1/admin/access'].includes(path)) {
      return reply.code(403).send({ error: 'Acesso disponível apenas ao teste de Administração.' })
    }
    return
  }

  // A conta técnica Dev jamais recebe operações de escrita ou Admin.
  if (process.env.FAROL_PREVIEW_ADMIN_QA_READONLY === 'true' &&
      path.startsWith('/api/v1/')) {
    if (path.startsWith('/api/v1/admin/')) {
      return reply.code(404).send({ error: 'Recurso indisponível nesta Preview.' })
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return reply.code(403).send({ error: 'Preview financeira somente leitura.' })
    }
  }
  if (path.startsWith('/api/v1/') &&
      path !== '/api/v1/health' && path !== '/api/v1/ready' &&
      !isVerifiedDevPreviewEnvironment(process.env)) {
    return reply.code(503).send({ error: 'Ambiente de testes não isolado.' })
  }
})

const app = buildApp({
  auth,
  async checkSuperAdmin(userId, token) {
    // A Preview de migração é estritamente financeira e só de leitura.
    // Não concede nem inspeciona acesso ao Farol Admin.
    if (process.env.FAROL_PREVIEW_ADMIN_QA_READONLY === 'true') return false
    if (authOnlyQa) {
      if (!isVerifiedAuthOnlyDevPreview(process.env) || !qaVerifier) return false
      return qaVerifier.checkSuperAdmin(userId, token)
    }
    // Nunca confiar apenas em app_metadata do JWT, que pode estar desatualizado.
    // A consulta parametrizada lê o papel atual da conta, sem devolver informações pessoais.
    const prisma = await getPrisma()
    const rows = await prisma.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM auth.users AS admin_account
        WHERE admin_account.id = ${userId}::uuid
          AND admin_account.raw_app_meta_data->>'farol_role' = 'super_admin'
          AND admin_account.email_confirmed_at IS NOT NULL
          AND admin_account.deleted_at IS NULL
          AND admin_account.is_anonymous IS NOT TRUE
          AND (admin_account.banned_until IS NULL OR admin_account.banned_until <= NOW())
          AND EXISTS (
            SELECT 1 FROM auth.mfa_factors AS verified_factor
            WHERE verified_factor.user_id = admin_account.id
              AND verified_factor.factor_type = 'totp'
              AND verified_factor.status = 'verified'
          )
      ) AS allowed
    `
    return rows.length === 1 && rows[0].allowed === true
  },
  workspaceService: new WorkspaceService(lazyRepository),
  transactionRepository: lazyTransactions,
  financialCatalog: lazyCatalog,
  financialCatalogMutations: lazyMutations,
  invoiceRepository: lazyInvoices,
  legacyConnectionService: lazyLegacyConnection,
  legacyReadinessInspector: lazyReadiness,
  // Segurança: sem ativação por variável ambiental, mesmo se escritas comuns
  // estiverem habilitadas. Liberar só após QA real e revisão separada.
  allowLegacyConnectionWrites: false,
  allowInvoiceReads: process.env.FAROL_INVOICE_READS_ENABLED === 'true',
  allowInvoiceUploads: process.env.FAROL_INVOICE_UPLOADS_ENABLED === 'true' &&
    process.env.FAROL_FINANCIAL_WRITES_ENABLED === 'true' &&
    process.env.VERCEL_ENV !== 'preview',
  corsOrigin: corsOrigin(),
  // Por segurança, deployments Preview não aceitam criar espaços nem mesmo
  // por requisições diretas (a trava VITE_* sozinha não protege a API).
  // Fail closed: nunca autorizar gravações por inferência do ambiente.
  // Habilitar somente após E2E, revisão dos segredos e isolamento comprovado.
  allowWorkspaceWrites: process.env.FAROL_FINANCIAL_WRITES_ENABLED === 'true' &&
    process.env.VERCEL_ENV !== 'preview',
  async checkDatabase() {
    // No QA de autorização só verificamos a saúde do Supabase Auth Dev.
    // Nenhuma conexão a PostgreSQL, Prisma ou dados financeiros é criada.
    if (authOnlyQa) return isVerifiedAuthOnlyDevPreview(process.env) &&
      !!qaVerifier && await qaVerifier.ready()
    // Nem mesmo o endpoint readiness deve contactar um banco inesperado.
    if (!isVerifiedDevPreviewEnvironment(process.env)) return false
    // Validação de variáveis e consulta SQL apenas em /ready, nunca em /health.
    const config = readConfig(process.env)
    if (process.env.VERCEL_ENV === 'preview') {
      const { diagnosePgConnection } = await import('./infrastructure/database/diagnosePgConnection.js')
      const { inspectPrismaWasm } = await import('./infrastructure/database/tracePrismaWasm.js')
      inspectPrismaWasm()
      await diagnosePgConnection(config.DATABASE_URL)
    }
    const prisma = await getPrisma()
    if (process.env.VERCEL_ENV === 'preview') {
      console.info('[farol-api] Prisma criado; iniciando $connect')
    }
    await prisma.$connect()
    if (process.env.VERCEL_ENV === 'preview') {
      console.info('[farol-api] Prisma $connect OK; iniciando SELECT 1')
    }
    await prisma.$queryRaw`SELECT 1`
    if (process.env.VERCEL_ENV === 'preview') {
      console.info('[farol-api] Prisma SELECT 1 OK')
    }
    return true
  },
}, guardedFastify)

app.addHook('onClose', async () => {
  if (prismaPromise) {
    const prisma = await prismaPromise.catch(() => null)
    await prisma?.$disconnect()
  }
})

// A Function usa esta instância sem abrir porta; server.ts inicia apenas em modo local.
export default app
