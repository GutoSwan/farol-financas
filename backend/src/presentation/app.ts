import Fastify from 'fastify'
import { z } from 'zod'
import type { AuthVerifier } from '../infrastructure/auth/SupabaseJwtVerifier.js'
import { WorkspaceService } from '../application/use-cases/WorkspaceService.js'
import type { TransactionRepository } from '../domain/repositories/TransactionRepository.js'
import { randomUUID } from 'node:crypto'
import type { InvoiceRepository } from '../domain/repositories/InvoiceRepository.js'
import type { FinancialCatalogRepository } from '../domain/repositories/FinancialCatalogRepository.js'
import type { CatalogKind, CatalogCreate, CatalogUpdate, FinancialCatalogMutations } from '../domain/repositories/FinancialCatalogMutations.js'
import { StaleFinancialRecordError } from '../domain/errors/StaleFinancialRecordError.js'
import type { LegacyConnectionService } from '../application/use-cases/PrismaLegacyTransactionConnectionService.js'
import { LegacyReadinessForbiddenError, type LegacyReadinessInspector } from '../application/use-cases/LegacyReadinessInspector.js'
import { LegacyConnectionValidationError, LegacyConnectionAccessError, LegacyConnectionOccupiedError } from '../application/use-cases/PrismaLegacyTransactionConnectionService.js'
import { LegacyMappingConflictError } from '../infrastructure/repositories/PrismaLegacyImportMappingService.js'

// A versão obrigatória vem da última leitura do registro: If-Match: "1".
 // Uma rota sem precondição nunca pode sobrescrever dados silenciosamente.
const versionHeader = /^"([1-9][0-9]{0,9})"$/
function parseExpectedVersion(raw: unknown): { status: 'ok'; version: number } | { status: 'missing' } | { status: 'invalid' } {
  if (raw === undefined) return { status: 'missing' }
  if (typeof raw !== 'string') return { status: 'invalid' }
  const match = versionHeader.exec(raw)
  if (!match) return { status: 'invalid' }
  const version = Number(match[1])
  if (!Number.isSafeInteger(version) || version > 2147483646) return { status: 'invalid' }
  return { status: 'ok', version }
}

const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(60),
}).strict()

// Bloquear campos arbitrários, valores inválidos e datas impossíveis.
const transactionInputSchema = z.object({
  description: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(40),
  amountCents: z.number().int().min(1).max(2147483647),
  kind: z.enum(['EXPENSE', 'INCOME']),
  occurredOn: z.iso.date().refine(value => {
    const date = new Date(value + 'T00:00:00.000Z')
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  }),
}).strict()

const transactionPatchSchema = transactionInputSchema.partial().refine(
  value => Object.keys(value).length > 0,
  { message: 'Informe ao menos um campo para atualizar.' },
)

const yearMonthSchema = z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/)
const positiveCents = z.number().int().min(1).max(2147483647)
const billSchema = z.object({
  name: z.string().trim().min(1).max(80),
  dueDay: z.number().int().min(1).max(31),
  active: z.boolean().default(true),
}).strict()
const fixedSchema = z.object({
  name: z.string().trim().min(1).max(80),
  amountCents: positiveCents,
  dueDay: z.number().int().min(1).max(31),
  startMonth: yearMonthSchema,
  endBeforeMonth: yearMonthSchema.nullable().default(null),
}).strict().refine(value => !value.endBeforeMonth || value.endBeforeMonth > value.startMonth)
const budgetSchema = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(40),
  targetCents: positiveCents,
  status: z.enum(['PLANNING', 'QUOTING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED']).default('PLANNING'),
  notes: z.string().max(4000).default(''),
}).strict()
const billPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  active: z.boolean().optional(),
}).strict().refine(v => Object.keys(v).length > 0)
const fixedPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  amountCents: positiveCents.optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  // Alterações do intervalo exigem envio dos dois campos para preservar consistência.
  startMonth: yearMonthSchema.optional(),
  endBeforeMonth: yearMonthSchema.nullable().optional(),
}).strict().refine(v => Object.keys(v).length > 0)
  .refine(v => !('startMonth' in v || 'endBeforeMonth' in v) ||
    (v.startMonth !== undefined && 'endBeforeMonth' in v &&
      (!v.endBeforeMonth || v.endBeforeMonth > v.startMonth)))
const budgetPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(40).optional(),
  targetCents: positiveCents.optional(),
  status: z.enum(['PLANNING', 'QUOTING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED']).optional(),
  notes: z.string().max(4000).optional(),
}).strict().refine(v => Object.keys(v).length > 0)
function parseCatalogInput(kind: CatalogKind, body: unknown, patch: boolean) {
  switch (kind) {
    case 'recurring-bills': return (patch ? billPatchSchema : billSchema).safeParse(body)
    case 'fixed-expenses': return (patch ? fixedPatchSchema : fixedSchema).safeParse(body)
    case 'budgets': return (patch ? budgetPatchSchema : budgetSchema).safeParse(body)
  }
}

const newInvoiceSchema = z.object({
  billingMonth: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/),
  issuer: z.string().trim().min(2).max(80),
  totalCents: z.number().int().min(1).max(2147483647),
  dueDate: z.iso.date(),
  cardLast4: z.string().regex(/^[0-9]{4}$/).optional(),
  // PDF binário em base64; limite estrito abaixo do payload máximo da Vercel.
  pdfBase64: z.string().min(12).max(2_850_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
}).strict()

export interface AppDependencies {
  auth: AuthVerifier
  workspaceService: WorkspaceService
  transactionRepository?: TransactionRepository
  financialCatalog?: FinancialCatalogRepository
  financialCatalogMutations?: FinancialCatalogMutations
  invoiceRepository?: InvoiceRepository
  allowInvoiceUploads?: boolean
  allowInvoiceReads?: boolean
  checkDatabase(): Promise<boolean>
  /** Lê papel Super Admin atual diretamente do auth.users, nunca do JWT ou navegador. */
  checkSuperAdmin?: (userId: string, token?: string) => Promise<boolean>
  corsOrigin?: string
  /** Preview usa banco real por enquanto: impedir gravações HTTP no servidor. */
  allowWorkspaceWrites?: boolean
  /** Flag independente: nunca habilitar migração via flag geral de escrita. */
  allowLegacyConnectionWrites?: boolean
  legacyConnectionService?: LegacyConnectionService
  /** Leitura exata em transação: não habilita a conexão de dados legados. */
  legacyReadinessInspector?: LegacyReadinessInspector
}

// Permite que o entrypoint serverless crie Fastify diretamente para o detector da Vercel.
// Testes e execução local continuam usando a instância padrão.
export function buildApp(deps: AppDependencies, app = Fastify({ logger: false, bodyLimit: 100_000 })) {

  // O CORS só autoriza o frontend conhecido. JWT é sempre obrigatório nos dados.
  // O preflight não pode resultar em 404 nem refletir origens arbitrárias.
  if (deps.corsOrigin) {
    const allowed = new URL(deps.corsOrigin).origin
    app.addHook('onRequest', async (request, reply) => {
      const origin = request.headers.origin
      if (!origin) return
      reply.header('Vary', 'Origin')
      if (origin !== allowed) {
        return reply.code(403).send({ error: 'Origem não autorizada.' })
      }
      reply.header('Access-Control-Allow-Origin', allowed)
      reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, If-Match')
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
      reply.header('Access-Control-Max-Age', '600')
      if (request.method === 'OPTIONS') return reply.code(204).send()
    })
  }


  // Não permitir armazenamento intermediário de respostas da API autenticada.
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/api/v1/')) {
      reply.header('Cache-Control', 'no-store, private')
      reply.header('X-Content-Type-Options', 'nosniff')
      reply.header('Referrer-Policy', 'no-referrer')
      reply.header('X-Frame-Options', 'DENY')
      reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
      reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
      reply.header('Cross-Origin-Resource-Policy', 'same-site')
    }
    return payload
  })

  app.get('/api/v1/health', async () => ({ status: 'ok', service: 'farol-api', version: '0.13.0' }))

  app.get('/api/v1/ready', async (_request, reply) => {
    try {
      if (await deps.checkDatabase()) return { status: 'ready' }
    } catch (error) {
      // Diagnóstico seguro: somente códigos padronizados e tipo do erro do driver.
      // Nunca registrar error.message, stack, meta completo, SQL, URL ou credenciais.
      const asRecord = (value: unknown): Record<string, unknown> | undefined =>
        value !== null && typeof value === 'object'
          ? value as Record<string, unknown>
          : undefined
      const wrapped = asRecord(error)
      const meta = asRecord(wrapped?.meta)
      const adapter = asRecord(meta?.driverAdapterError)
      const driverCause = asRecord(adapter?.cause)
      const genericCause = asRecord(wrapped?.cause)
      const candidates = [
        wrapped?.code,
        meta?.code,
        driverCause?.originalCode,
        driverCause?.code,
        genericCause?.originalCode,
        genericCause?.code,
      ]
      const safeCodes = candidates.filter((candidate): candidate is string =>
        typeof candidate === 'string' &&
        /^(?:P\d{4}|[0-9A-Z]{5}|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)$/.test(candidate)
      )
      const kind = driverCause?.kind
      const safeKind = typeof kind === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(kind)
        ? kind : 'não identificado'
      // Não registrar mensagens brutas do Prisma: podem conter URL, SQL e dados.
      // As expressões abaixo somente produzem uma categoria fixa e não sensível.
      const diagnosticText = [
        error instanceof Error ? error.message : '',
        typeof driverCause?.originalMessage === 'string' ? driverCause.originalMessage : '',
      ].join(' ').toLowerCase()
      let prismaCategory = 'outra'
      if (/tls|ssl|certificate|self.signed/.test(diagnosticText)) prismaCategory = 'certificado'
      else if (/prepared statement|already exists|does not exist/.test(diagnosticText)) prismaCategory = 'prepared-statement'
      else if (/unsupported|deserialize|unknown type|unknown column|column type/.test(diagnosticText)) prismaCategory = 'tipo-de-coluna'
      else if (/authentication|password|scram|sasl|denied/.test(diagnosticText)) prismaCategory = 'autenticacao'
      else if (/timeout|timed out|connection refused|connect/.test(diagnosticText)) prismaCategory = 'conexao'
      else if (/syntax|sqlstate/.test(diagnosticText)) prismaCategory = 'sql'
      // Reporta apenas nomes de classes da cadeia de causas, nunca valores.
      const causeClasses: string[] = []
      let currentCause: unknown = error
      for (let depth = 0; depth < 4; depth++) {
        const record = asRecord(currentCause)
        if (!record) break
        const rawName = record.name
        causeClasses.push(typeof rawName === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(rawName)
          ? rawName : 'Desconhecido')
        currentCause = record.cause
      }
      // Classifica as mensagens em categorias fixas. Não imprimir mensagem,
      // stack, meta ou causa brutas, pois podem conter SQL, URLs e segredos.
      const causesForClassify: unknown[] = [error, wrapped?.cause, meta?.driverAdapterError, driverCause]
      const texts = causesForClassify
        .filter((part): part is Record<string, unknown> => Boolean(asRecord(part)))
        .map((part) => typeof part.message === 'string' ? part.message : '')
      const errorText = texts.join(' ').toLowerCase()
      const fingerprints: Array<[RegExp, string]> = [
        [/did not initialize yet|prisma generate|generated client/, 'client-nao-gerado'],
        [/cannot find module|module not found|err_module_not_found|cannot resolve|failed to import/, 'modulo-ausente'],
        [/enoent|no such file|cannot find module|module not found/, 'arquivo-ausente'],
        [/query_compiler_bg|query_compiler|wasm/, 'wasm'],
        [/webassembly\.instantiate|compileerror|linkerror/, 'wasm-instanciacao'],
        [/querycompiler|query compiler|query engine|engine type|enginetype/, 'engine'],
        [/external connector|externalconnector/, 'conector-externo'],
        [/\.connect.*\.catch is not a function|connect.*catch is not a function/, 'instrumentacao-pg'],
        [/pool.*(?:ended|closed)|cannot use a pool after calling end/, 'pool-encerrado'],
        [/undefined|not a function|null is not|cannot read properties/, 'erro-de-tipo'],
        [/tls|ssl|certificate|self.signed/, 'ssl'],
        [/password|authentication|sasl|scram/, 'autenticacao'],
        [/timeout|timed out|econnrefused|connection refused/, 'rede'],
      ]
      const problemTags = fingerprints
        .filter(([pattern]) => pattern.test(errorText))
        .map(([, tag]) => tag)
        .slice(0, 5)
      const safeShape = {
        nome: error instanceof Error ? error.name : 'Desconhecido',
        mensagemExiste: error instanceof Error && error.message.length > 0,
        mensagensMultilinha: errorText.includes('\n'),
        quantidadeCausas: causesForClassify.filter((part) => Boolean(asRecord(part))).length,
      }
      console.error('[farol-api] Prisma Client diagnostico seguro:',
        'sinais=' + (problemTags.join(',') || 'nenhum'),
        'mensagem=' + (safeShape.mensagemExiste ? 'presente' : 'ausente'),
        'multilinha=' + safeShape.mensagensMultilinha,
        'niveis=' + safeShape.quantidadeCausas)
      console.error('[farol-api] /ready indisponível:',
        error instanceof Error ? error.name : 'Erro desconhecido',
        'codes=' + (safeCodes.length ? [...new Set(safeCodes)].join(',') : 'indisponível'),
        'driverKind=' + safeKind,
        'prismaCategoria=' + prismaCategory,
        'causas=' + causeClasses.join('>'))
    }
    return reply.code(503).send({ status: 'unavailable' })
  })

  async function authorized(request: { headers: { authorization?: string } }, reply: { code(status: number): { send(payload: object): void } }) {
    const authorization = request.headers.authorization ?? ''
    const match = /^Bearer\s+(\S+)$/i.exec(authorization)
    if (!match) {
      reply.code(401).send({ error: 'Autenticação necessária.' })
      return null
    }
    try {
      return await deps.auth.verifyAccessToken(match[1])
    } catch {
      reply.code(401).send({ error: 'Token inválido ou expirado.' })
      return null
    }
  }

  // Identidade derivada exclusivamente de um JWT assinado e validado pelo servidor.
  app.get('/api/v1/me', async (request, reply) => {
    const identity = await authorized(request, reply)
    if (!identity) return
    return { data: { id: identity.userId } }
  })

  // Resposta mínima: sem lista de usuários, tokens, banco ou segredos.
  // Protegida por assinatura JWT, sessão ativa, MFA AAL2 e papel consultado no DB.
  app.get('/api/v1/admin/access', async (request, reply) => {
    const identity = await authorized(request, reply)
    if (!identity) return
    if (identity.assuranceLevel !== 'aal2') return reply.code(403).send({ error: 'Confirme o segundo fator.' })
    if (!deps.checkSuperAdmin || !await deps.checkSuperAdmin(identity.userId, typeof request.headers.authorization === 'string' && request.headers.authorization.startsWith('Bearer ')
      ? request.headers.authorization.slice(7) : undefined)) {
      return reply.code(403).send({ error: 'Acesso reservado ao Super Admin.' })
    }
    return { data: { superAdmin: true } }
  })

  app.get('/api/v1/workspaces', async (request, reply) => {
    const identity = await authorized(request, reply)
    if (!identity) return
    if (identity.assuranceLevel !== 'aal2') {
      return reply.code(403).send({ error: 'Autenticação em duas etapas necessária para consultar dados financeiros.' })
    }
    return { data: await deps.workspaceService.listForUser(identity.userId) }
  })

  // ID de espaço não é prova de autorização. A API devolve 404 tanto para
  // espaços inexistentes quanto para espaços aos quais o usuário não pertence,
  // evitando facilitar enumeração de recursos de outras pessoas.
  app.get<{ Params: { workspaceId: string } }>('/api/v1/workspaces/:workspaceId', async (request, reply) => {
    const identity = await authorized(request, reply)
    if (!identity) return
    if (identity.assuranceLevel !== 'aal2') {
      return reply.code(403).send({ error: 'Autenticação em duas etapas necessária para consultar dados financeiros.' })
    }
    const parsed = z.string().uuid().safeParse(request.params.workspaceId)
    if (!parsed.success) {
      return reply.code(404).send({ error: 'Espaço não encontrado.' })
    }
    try {
      await deps.workspaceService.requireMember(identity.userId, parsed.data)
    } catch (error) {
      // Erros do banco precisam continuar sendo 503/500, não parecer 404.
      if (!(error instanceof Error) || error.message !== 'Acesso negado ao espaço financeiro.') throw error
      return reply.code(404).send({ error: 'Espaço não encontrado.' })
    }
    const workspaces = await deps.workspaceService.listForUser(identity.userId)
    const workspace = workspaces.find(item => item.id === parsed.data)
    if (!workspace) return reply.code(404).send({ error: 'Espaço não encontrado.' })
    return { data: workspace }
  })

  // Faturas são PRIVADAS por usuário mesmo dentro de um workspace familiar.
  // Downloads permanecem bloqueados até varredura de malware + teste E2E real.
  app.get<{ Params: { workspaceId: string } }>('/api/v1/workspaces/:workspaceId/invoices', async (request, reply) => {
    if (deps.allowInvoiceReads !== true) return reply.code(503).send({ error: 'Faturas indisponíveis.' })
    const identity = await authorized(request, reply)
    if (!identity) return
    if (identity.assuranceLevel !== 'aal2') {
      return reply.code(403).send({ error: 'Autenticação em duas etapas necessária.' })
    }
    const space = z.string().uuid().safeParse(request.params.workspaceId)
    if (!space.success) return reply.code(404).send({ error: 'Espaço não encontrado.' })
    try {
      await deps.workspaceService.requireMember(identity.userId, space.data)
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Acesso negado ao espaço financeiro.') throw error
      return reply.code(404).send({ error: 'Espaço não encontrado.' })
    }
    if (!deps.invoiceRepository) return reply.code(503).send({ error: 'Faturas indisponíveis.' })
    return { data: await deps.invoiceRepository.listPersonal(space.data, identity.userId) }
  })

  app.post<{ Params: { workspaceId: string } }>('/api/v1/workspaces/:workspaceId/invoices', {
    bodyLimit: 3_200_000,
  }, async (request, reply) => {
    const identity = await authorized(request, reply)
    if (!identity) return
    if (identity.assuranceLevel !== 'aal2') {
      return reply.code(403).send({ error: 'Autenticação em duas etapas necessária.' })
    }
    const space = z.string().uuid().safeParse(request.params.workspaceId)
    if (!space.success) return reply.code(404).send({ error: 'Espaço não encontrado.' })
    // Independente das outras telas, upload de faturas exige DUAS flags no servidor.
    if (deps.allowWorkspaceWrites !== true || deps.allowInvoiceUploads !== true) {
      return reply.code(403).send({ error: 'Envio de faturas não habilitado.' })
    }
    const parsed = newInvoiceSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Arquivo ou fatura inválidos.' })
    const encoded = parsed.data.pdfBase64
    const file = Buffer.from(encoded, 'base64')
    if (file.length < 12 || file.length > 2_000_000 ||
        file.toString('base64') !== encoded ||
        file.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return reply.code(400).send({ error: 'PDF inválido ou superior a 2 MB.' })
    }
    try {
      await deps.workspaceService.requireMember(identity.userId, space.data, ['OWNER','EDITOR'])
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Acesso negado ao espaço financeiro.') throw error
      return reply.code(404).send({ error: 'Espaço não encontrado.' })
    }
    if (!deps.invoiceRepository) return reply.code(503).send({ error: 'Faturas indisponíveis.' })
    const { billingMonth, issuer, totalCents, dueDate, cardLast4 } = parsed.data
    const result = await deps.invoiceRepository.create({
      id: randomUUID(), workspaceId: space.data, uploadedBy: identity.userId,
      billingMonth, metadata: { issuer, totalCents, dueDate, ...(cardLast4 ? {cardLast4} : {}) },
      pdfBytes: file,
    })
    // Em quarentena: não é possível abrir o PDF até análise segura do conteúdo.
    return reply.code(202).send({ data: result })
  })


  /**
   * Prévia exata da nuvem. Sem body financeiro e sem writes.
   * Autenticado por JWT, AAL2, dono OWNER no serviço E no snapshot Prisma.
   * Resposta contém apenas contagens, sem valores ou nomes de terceiros.
   */
  app.get<{ Params: { workspaceId: string } }>(
    '/api/v1/workspaces/:workspaceId/legacy-readiness', async (request, reply) => {
      const identity = await authorized(request, reply)
      if (!identity) return
      if (identity.assuranceLevel !== 'aal2') {
        return reply.code(403).send({ error: 'Confirme o Authenticator.' })
      }
      const id = z.string().uuid().safeParse(request.params.workspaceId)
      if (!id.success) return reply.code(404).send({ error: 'Espaço não encontrado.' })
      try {
        await deps.workspaceService.requireMember(identity.userId, id.data, ['OWNER'])
      } catch (error) {
        if (error instanceof Error && error.message === 'Acesso negado ao espaço financeiro.') {
          return reply.code(404).send({ error: 'Espaço não encontrado.' })
        }
        return reply.code(503).send({ error: 'Não foi possível conferir o destino.' })
      }
      if (!deps.legacyReadinessInspector) {
        return reply.code(503).send({ error: 'Conferência indisponível.' })
      }
      try {
        const result = await deps.legacyReadinessInspector.inspect(identity.userId, id.data)
        return { data: result }
      } catch (error) {
        if (error instanceof LegacyReadinessForbiddenError) {
          return reply.code(404).send({ error: 'Espaço não encontrado.' })
        }
        return reply.code(503).send({ error: 'Não foi possível conferir o destino.' })
      }
    },
  )

  // Primeira conexão real: associar espaço e ATÉ 25 lançamentos.
  // Desativada em produção e Preview até auditoria E2E; nunca confiar no
  // workspaceId ou no ownerUserId vindos do corpo da requisição.
  app.post<{ Params:{ workspaceId:string } }>(
    '/api/v1/workspaces/:workspaceId/legacy-connect', async (request,reply) => {
      const identity=await authorized(request,reply)
      if(!identity)return
      if(identity.assuranceLevel!=='aal2')return reply.code(403).send({error:'Confirme o Authenticator.'})
      const id=z.string().uuid().safeParse(request.params.workspaceId)
      if(!id.success)return reply.code(404).send({error:'Espaço não encontrado.'})
      if(deps.allowWorkspaceWrites!==true || deps.allowLegacyConnectionWrites!==true) {
        return reply.code(403).send({error:'Conexão de registros ainda indisponível neste ambiente.'})
      }
      try {
        await deps.workspaceService.requireMember(identity.userId,id.data,['OWNER'])
      } catch {
        return reply.code(404).send({error:'Espaço não encontrado.'})
      }
      if(!deps.legacyConnectionService)return reply.code(503).send({error:'Conexão indisponível.'})
      try {
        const result=await deps.legacyConnectionService.connect(identity.userId,id.data,request.body)
        return reply.code(200).send({data:result})
      } catch(error) {
        if(error instanceof LegacyConnectionValidationError)return reply.code(400).send({error:error.message})
        if(error instanceof LegacyConnectionAccessError)return reply.code(404).send({error:'Espaço não encontrado.'})
        if(error instanceof LegacyMappingConflictError || error instanceof LegacyConnectionOccupiedError ||
           (typeof error==='object' && error!==null && 'code' in error &&
            ['P2002','P2034'].includes(String(error.code)))) {
          return reply.code(409).send({error:'Conflito de conexão: revise os registros e tente novamente sem sobrescrever.'})
        }
        // Não expor stack/SQL/IDs/secrets ao navegador.
        return reply.code(503).send({error:'Falha na conexão. Nenhum lote foi confirmado.'})
      }
    },
  )

  // Catálogos financeiros em modo somente leitura. Não fornecer acesso às
  // tabelas filhas sem verificar a associação ao workspace do registro pai.
  type CatalogKind = 'recurring-bills' | 'fixed-expenses' | 'budgets'
  for (const kind of ['recurring-bills', 'fixed-expenses', 'budgets'] as const) {
    app.get<{ Params: { workspaceId: string }; Querystring: { limit?: string } }>(
      `/api/v1/workspaces/:workspaceId/${kind}`, async (request, reply) => {
        const identity = await authorized(request, reply)
        if (!identity) return
        if (identity.assuranceLevel !== 'aal2') {
          return reply.code(403).send({ error: 'Autenticação em duas etapas necessária para consultar dados financeiros.' })
        }
        const parsed = z.string().uuid().safeParse(request.params.workspaceId)
        if (!parsed.success) return reply.code(404).send({ error: 'Espaço não encontrado.' })
        const limitResult = z.coerce.number().int().min(1).max(100).safeParse(request.query.limit ?? '50')
        if (!limitResult.success) return reply.code(400).send({ error: 'Limite inválido.' })
        try {
          await deps.workspaceService.requireMember(identity.userId, parsed.data)
        } catch (error) {
          if (!(error instanceof Error) || error.message !== 'Acesso negado ao espaço financeiro.') throw error
          return reply.code(404).send({ error: 'Espaço não encontrado.' })
        }
        if (!deps.financialCatalog) return reply.code(503).send({ error: 'Módulo indisponível.' })
        const catalog: CatalogKind = kind
        switch (catalog) {
          case 'recurring-bills':
            return { data: await deps.financialCatalog.listRecurringBills(parsed.data, limitResult.data) }
          case 'fixed-expenses':
            return { data: await deps.financialCatalog.listFixedExpenses(parsed.data, limitResult.data) }
          case 'budgets':
            return { data: await deps.financialCatalog.listBudgets(parsed.data, limitResult.data) }
        }
      },
    )
  }

  // Não há mutações sem MFA, autorização OWNER/EDITOR e escopo de workspace.
  for (const kind of ['recurring-bills', 'fixed-expenses', 'budgets'] as const) {
    const base = `/api/v1/workspaces/:workspaceId/${kind}`
    app.post<{ Params: { workspaceId: string } }>(base, async (request, reply) => {
      const identity = await authorized(request, reply)
      if (!identity) return
      if (identity.assuranceLevel !== 'aal2') return reply.code(403).send({ error: 'Autenticação em duas etapas necessária.' })
      const space = z.string().uuid().safeParse(request.params.workspaceId)
      if (!space.success) return reply.code(404).send({ error: 'Registro não encontrado.' })
      if (deps.allowWorkspaceWrites !== true) return reply.code(403).send({ error: 'Gravação desativada neste Preview.' })
      const parsed = parseCatalogInput(kind, request.body, false)
      if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
      try {
        await deps.workspaceService.requireMember(identity.userId, space.data, ['OWNER', 'EDITOR'])
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'Acesso negado ao espaço financeiro.') throw error
        return reply.code(404).send({ error: 'Registro não encontrado.' })
      }
      if (!deps.financialCatalogMutations) return reply.code(503).send({ error: 'Módulo indisponível.' })
      // A entrada foi validada pelo esquema correspondente ao discriminador kind.
      const input = { kind, workspaceId: space.data, data: parsed.data } as CatalogCreate
      const data = await deps.financialCatalogMutations.create(input)
      return reply.code(201).send({ data })
    })

    app.patch<{ Params: { workspaceId: string; recordId: string } }>(base + '/:recordId', async (request, reply) => {
      const identity = await authorized(request, reply)
      if (!identity) return
      if (identity.assuranceLevel !== 'aal2') return reply.code(403).send({ error: 'Autenticação em duas etapas necessária.' })
      const space = z.string().uuid().safeParse(request.params.workspaceId)
      const record = z.string().uuid().safeParse(request.params.recordId)
      if (!space.success || !record.success) return reply.code(404).send({ error: 'Registro não encontrado.' })
      if (deps.allowWorkspaceWrites !== true) return reply.code(403).send({ error: 'Gravação desativada neste Preview.' })
      const parsed = parseCatalogInput(kind, request.body, true)
      if (!parsed.success) return reply.code(400).send({ error: 'Alterações inválidas.' })
      try {
        await deps.workspaceService.requireMember(identity.userId, space.data, ['OWNER', 'EDITOR'])
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'Acesso negado ao espaço financeiro.') throw error
        return reply.code(404).send({ error: 'Registro não encontrado.' })
      }
      if (!deps.financialCatalogMutations) return reply.code(503).send({ error: 'Módulo indisponível.' })
      const expected = parseExpectedVersion(request.headers['if-match'])
      if (expected.status === 'missing') return reply.code(428).send({ error: 'Envie If-Match com a versão atual do registro.' })
      if (expected.status === 'invalid') return reply.code(400).send({ error: 'Versão inválida.' })
      try {
        const input = { kind, workspaceId: space.data, id: record.data,
          expectedVersion: expected.version, data: parsed.data } as CatalogUpdate
        const data = await deps.financialCatalogMutations.update(input)
        if (!data) return reply.code(404).send({ error: 'Registro não encontrado.' })
        return { data }
      } catch (error) {
        if (error instanceof StaleFinancialRecordError) return reply.code(409).send({ error: error.message, code: 'VERSION_CONFLICT' })
        throw error
      }
    })

    app.delete<{ Params: { workspaceId: string; recordId: string } }>(base + '/:recordId', async (request, reply) => {
      const identity = await authorized(request, reply)
      if (!identity) return
      if (identity.assuranceLevel !== 'aal2') return reply.code(403).send({ error: 'Autenticação em duas etapas necessária.' })
      const space = z.string().uuid().safeParse(request.params.workspaceId)
      const record = z.string().uuid().safeParse(request.params.recordId)
      if (!space.success || !record.success) return reply.code(404).send({ error: 'Registro não encontrado.' })
      if (deps.allowWorkspaceWrites !== true) return reply.code(403).send({ error: 'Gravação desativada neste Preview.' })
      try {
        await deps.workspaceService.requireMember(identity.userId, space.data, ['OWNER', 'EDITOR'])
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'Acesso negado ao espaço financeiro.') throw error
        return reply.code(404).send({ error: 'Registro não encontrado.' })
      }
      if (!deps.financialCatalogMutations) return reply.code(503).send({ error: 'Módulo indisponível.' })
      const expected = parseExpectedVersion(request.headers['if-match'])
      if (expected.status === 'missing') return reply.code(428).send({ error: 'Envie If-Match com a versão atual do registro.' })
      if (expected.status === 'invalid') return reply.code(400).send({ error: 'Versão inválida.' })
      try {
        if (!await deps.financialCatalogMutations.delete(kind, space.data, record.data, expected.version)) {
          return reply.code(404).send({ error: 'Registro não encontrado.' })
        }
        return reply.code(204).send()
      } catch (error) {
        if (error instanceof StaleFinancialRecordError) return reply.code(409).send({ error: error.message, code: 'VERSION_CONFLICT' })
        throw error
      }
    })
  }

  // Transações pertencem ao espaço autorizado, não ao usuário indicado no corpo.
  // A conexão Prisma pode ignorar RLS: nenhuma rota pode pular requireMember.
  app.get<{ Params: { workspaceId: string }; Querystring: { limit?: string } }>(
    '/api/v1/workspaces/:workspaceId/transactions', async (request, reply) => {
      const identity = await authorized(request, reply)
      if (!identity) return
      if (identity.assuranceLevel !== 'aal2') {
        return reply.code(403).send({ error: 'Autenticação em duas etapas necessária para consultar dados financeiros.' })
      }
      const workspaceId = z.string().uuid().safeParse(request.params.workspaceId)
      if (!workspaceId.success) return reply.code(404).send({ error: 'Espaço não encontrado.' })
      const limitResult = z.coerce.number().int().min(1).max(100).safeParse(request.query.limit ?? '50')
      if (!limitResult.success) return reply.code(400).send({ error: 'Limite inválido.' })
      try {
        await deps.workspaceService.requireMember(identity.userId, workspaceId.data)
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'Acesso negado ao espaço financeiro.') throw error
        return reply.code(404).send({ error: 'Espaço não encontrado.' })
      }
      if (!deps.transactionRepository) return reply.code(503).send({ error: 'Módulo indisponível.' })
      const entries = await deps.transactionRepository.listForWorkspace(workspaceId.data, limitResult.data)
      return { data: entries }
    },
  )

  app.post<{ Params: { workspaceId: string } }>(
    '/api/v1/workspaces/:workspaceId/transactions', async (request, reply) => {
      const identity = await authorized(request, reply)
      if (!identity) return
      if (identity.assuranceLevel !== 'aal2') {
        return reply.code(403).send({ error: 'Autenticação em duas etapas necessária para alterar dados financeiros.' })
      }
      const workspaceId = z.string().uuid().safeParse(request.params.workspaceId)
      if (!workspaceId.success) return reply.code(404).send({ error: 'Espaço não encontrado.' })
      // Preview nunca grava dados financeiros reais, independentemente do token.
      if (deps.allowWorkspaceWrites !== true) {
        return reply.code(403).send({ error: 'Gravação financeira desativada neste ambiente de testes.' })
      }
      const parsed = transactionInputSchema.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ error: 'Lançamento inválido.' })
      try {
        await deps.workspaceService.requireMember(identity.userId, workspaceId.data, ['OWNER', 'EDITOR'])
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'Acesso negado ao espaço financeiro.') throw error
        return reply.code(404).send({ error: 'Espaço não encontrado.' })
      }
      if (!deps.transactionRepository) return reply.code(503).send({ error: 'Módulo indisponível.' })
      const saved = await deps.transactionRepository.createForWorkspace({
        workspaceId: workspaceId.data,
        ...parsed.data,
      })
      return reply.code(201).send({ data: saved })
    },
  )


  // PATCH e DELETE exigem MFA e papel de escrita; nenhum ID do cliente autoriza acesso isoladamente.
  app.patch<{ Params: { workspaceId: string; transactionId: string } }>(
    '/api/v1/workspaces/:workspaceId/transactions/:transactionId', async (request, reply) => {
      const identity = await authorized(request, reply)
      if (!identity) return
      if (identity.assuranceLevel !== 'aal2') {
        return reply.code(403).send({ error: 'Autenticação em duas etapas necessária para alterar dados financeiros.' })
      }
      const workspaceId = z.string().uuid().safeParse(request.params.workspaceId)
      const transactionId = z.string().uuid().safeParse(request.params.transactionId)
      if (!workspaceId.success || !transactionId.success) return reply.code(404).send({ error: 'Lançamento não encontrado.' })
      if (deps.allowWorkspaceWrites !== true) {
        return reply.code(403).send({ error: 'Gravação financeira desativada neste ambiente de testes.' })
      }
      const parsed = transactionPatchSchema.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ error: 'Alterações inválidas.' })
      try {
        await deps.workspaceService.requireMember(identity.userId, workspaceId.data, ['OWNER', 'EDITOR'])
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'Acesso negado ao espaço financeiro.') throw error
        return reply.code(404).send({ error: 'Lançamento não encontrado.' })
      }
      if (!deps.transactionRepository) return reply.code(503).send({ error: 'Módulo indisponível.' })
      const expected = parseExpectedVersion(request.headers['if-match'])
      if (expected.status === 'missing') return reply.code(428).send({ error: 'Envie If-Match com a versão atual do lançamento.' })
      if (expected.status === 'invalid') return reply.code(400).send({ error: 'Versão inválida.' })
      try {
        const updated = await deps.transactionRepository.updateWithinWorkspace(
          workspaceId.data, transactionId.data, parsed.data, expected.version,
        )
        if (!updated) return reply.code(404).send({ error: 'Lançamento não encontrado.' })
        return { data: updated }
      } catch (error) {
        if (error instanceof StaleFinancialRecordError) return reply.code(409).send({ error: error.message, code: 'VERSION_CONFLICT' })
        throw error
      }
    },
  )

  app.delete<{ Params: { workspaceId: string; transactionId: string } }>(
    '/api/v1/workspaces/:workspaceId/transactions/:transactionId', async (request, reply) => {
      const identity = await authorized(request, reply)
      if (!identity) return
      if (identity.assuranceLevel !== 'aal2') {
        return reply.code(403).send({ error: 'Autenticação em duas etapas necessária para alterar dados financeiros.' })
      }
      const workspaceId = z.string().uuid().safeParse(request.params.workspaceId)
      const transactionId = z.string().uuid().safeParse(request.params.transactionId)
      if (!workspaceId.success || !transactionId.success) return reply.code(404).send({ error: 'Lançamento não encontrado.' })
      if (deps.allowWorkspaceWrites !== true) {
        return reply.code(403).send({ error: 'Gravação financeira desativada neste ambiente de testes.' })
      }
      try {
        await deps.workspaceService.requireMember(identity.userId, workspaceId.data, ['OWNER', 'EDITOR'])
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'Acesso negado ao espaço financeiro.') throw error
        return reply.code(404).send({ error: 'Lançamento não encontrado.' })
      }
      if (!deps.transactionRepository) return reply.code(503).send({ error: 'Módulo indisponível.' })
      const expected = parseExpectedVersion(request.headers['if-match'])
      if (expected.status === 'missing') return reply.code(428).send({ error: 'Envie If-Match com a versão atual do lançamento.' })
      if (expected.status === 'invalid') return reply.code(400).send({ error: 'Versão inválida.' })
      try {
        const deleted = await deps.transactionRepository.deleteWithinWorkspace(
          workspaceId.data, transactionId.data, expected.version,
        )
        if (!deleted) return reply.code(404).send({ error: 'Lançamento não encontrado.' })
        return reply.code(204).send()
      } catch (error) {
        if (error instanceof StaleFinancialRecordError) return reply.code(409).send({ error: error.message, code: 'VERSION_CONFLICT' })
        throw error
      }
    },
  )

  app.post('/api/v1/workspaces', async (request, reply) => {
    const identity = await authorized(request, reply)
    if (!identity) return
    if (identity.assuranceLevel !== 'aal2') {
      return reply.code(403).send({ error: 'Autenticação em duas etapas necessária para alterar dados financeiros.' })
    }
    if (deps.allowWorkspaceWrites !== true) {
      return reply.code(403).send({ error: 'Criação de espaços desativada neste ambiente de testes.' })
    }
    const parsed = createWorkspaceSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Informe um nome de espaço de 2 a 60 caracteres.' })
    const trimmed = parsed.data.name.trim()
    if (trimmed.length < 2) return reply.code(400).send({ error: 'Informe um nome de espaço válido.' })
    const workspace = await deps.workspaceService.createWorkspace(identity.userId, trimmed)
    return reply.code(201).send({ data: workspace })
  })

  app.setErrorHandler((error, _request, reply) => {
    // Evita expor detalhes do banco, SQL ou variáveis de ambiente aos clientes.
    // Erros brutos podem incluir conteúdo de requisições, SQL e dados privados.
    app.log.error({ errorType: error instanceof Error ? error.name : 'ErroDesconhecido' }, 'Erro não tratado')
    reply.code(500).send({ error: 'Erro interno do servidor.' })
  })

  return app
}
