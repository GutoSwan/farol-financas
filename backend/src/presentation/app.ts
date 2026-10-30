import Fastify from 'fastify'
import { z } from 'zod'
import type { AuthVerifier } from '../infrastructure/auth/SupabaseJwtVerifier.js'
import { WorkspaceService } from '../application/use-cases/WorkspaceService.js'

const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(60),
}).strict()

export interface AppDependencies {
  auth: AuthVerifier
  workspaceService: WorkspaceService
  checkDatabase(): Promise<boolean>
  corsOrigin?: string
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


  app.get('/api/v1/health', async () => ({ status: 'ok', service: 'farol-api', version: '0.13.0' }))

  app.get('/api/v1/ready', async (_request, reply) => {
    try {
      if (await deps.checkDatabase()) return { status: 'ready' }
    } catch { /* Não revelar credenciais nem detalhes internos */ }
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
    return { data: await deps.workspaceService.listForUser(identity.userId) }
  })

  app.post('/api/v1/workspaces', async (request, reply) => {
    const identity = await authorized(request, reply)
    if (!identity) return
    const parsed = createWorkspaceSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Informe um nome de espaço de 2 a 60 caracteres.' })
    const trimmed = parsed.data.name.trim()
    if (trimmed.length < 2) return reply.code(400).send({ error: 'Informe um nome de espaço válido.' })
    const workspace = await deps.workspaceService.createWorkspace(identity.userId, trimmed)
    return reply.code(201).send({ data: workspace })
  })

  app.setErrorHandler((error, _request, reply) => {
    // Evita expor detalhes do banco, SQL ou variáveis de ambiente aos clientes.
    app.log.error({ err: error }, 'Erro não tratado')
    reply.code(500).send({ error: 'Erro interno do servidor.' })
  })

  return app
}
