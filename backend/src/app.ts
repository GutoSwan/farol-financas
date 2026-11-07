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
import type { PrismaTransactionRepository } from './infrastructure/repositories/PrismaTransactionRepository.js'
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
  async updateWithinWorkspace(workspaceId, transactionId, changes) {
    return (await getTransactionRepository()).updateWithinWorkspace(workspaceId, transactionId, changes)
  },
  async deleteWithinWorkspace(workspaceId, transactionId) {
    return (await getTransactionRepository()).deleteWithinWorkspace(workspaceId, transactionId)
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
  async delete(kind, workspaceId, id) { return (await getMutations()).delete(kind, workspaceId, id) },
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
  transactionRepository: lazyTransactions,
  financialCatalog: lazyCatalog,
  financialCatalogMutations: lazyMutations,
  invoiceRepository: lazyInvoices,
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
}, Fastify({ logger: false, bodyLimit: 100_000 }))

app.addHook('onClose', async () => {
  if (prismaPromise) {
    const prisma = await prismaPromise.catch(() => null)
    await prisma?.$disconnect()
  }
})

// A Function usa esta instância sem abrir porta; server.ts inicia apenas em modo local.
export default app
