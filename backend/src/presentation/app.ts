import Fastify from 'fastify'
import { z } from 'zod'
import type { AuthVerifier } from '../infrastructure/auth/SupabaseJwtVerifier.js'
import { WorkspaceService } from '../application/use-cases/WorkspaceService.js'
import type { TransactionRepository } from '../domain/repositories/TransactionRepository.js'
import type { FinancialCatalogRepository } from '../domain/repositories/FinancialCatalogRepository.js'

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

export interface AppDependencies {
  auth: AuthVerifier
  workspaceService: WorkspaceService
  transactionRepository?: TransactionRepository
  financialCatalog?: FinancialCatalogRepository
  checkDatabase(): Promise<boolean>
  corsOrigin?: string
  /** Preview usa banco real por enquanto: impedir gravações HTTP no servidor. */
  allowWorkspaceWrites?: boolean
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
      reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
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
      if (deps.allowWorkspaceWrites === false) {
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
      if (deps.allowWorkspaceWrites === false) {
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
      const updated = await deps.transactionRepository.updateWithinWorkspace(
        workspaceId.data, transactionId.data, parsed.data,
      )
      if (!updated) return reply.code(404).send({ error: 'Lançamento não encontrado.' })
      return { data: updated }
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
      if (deps.allowWorkspaceWrites === false) {
        return reply.code(403).send({ error: 'Gravação financeira desativada neste ambiente de testes.' })
      }
      try {
        await deps.workspaceService.requireMember(identity.userId, workspaceId.data, ['OWNER', 'EDITOR'])
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'Acesso negado ao espaço financeiro.') throw error
        return reply.code(404).send({ error: 'Lançamento não encontrado.' })
      }
      if (!deps.transactionRepository) return reply.code(503).send({ error: 'Módulo indisponível.' })
      const deleted = await deps.transactionRepository.deleteWithinWorkspace(workspaceId.data, transactionId.data)
      if (!deleted) return reply.code(404).send({ error: 'Lançamento não encontrado.' })
      return reply.code(204).send()
    },
  )

  app.post('/api/v1/workspaces', async (request, reply) => {
    const identity = await authorized(request, reply)
    if (!identity) return
    if (identity.assuranceLevel !== 'aal2') {
      return reply.code(403).send({ error: 'Autenticação em duas etapas necessária para alterar dados financeiros.' })
    }
    if (deps.allowWorkspaceWrites === false) {
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
