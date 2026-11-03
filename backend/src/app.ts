import Fastify from 'fastify'

// Diagnóstico isolado: SEM banco de dados, SEM Supabase, SEM Prisma.
// Esta branch NÃO é uma versão de produção do Farol Finanças.
// Objetivo: distinguir falha da plataforma de falha nos imports/inicialização da API.
console.info('[farol-diag] carregou entrypoint Fastify')

const app = Fastify({ logger: false })

app.get('/', async () => ({ diagnostic: 'fastify-minimal', status: 'ok' }))
app.get('/api/v1/health', async () => ({ diagnostic: 'fastify-minimal', status: 'ok' }))

app.listen({ port: 3000, host: '0.0.0.0' })
  .then(() => console.info('[farol-diag] Fastify iniciado'))
  .catch((error: unknown) => {
    console.error('[farol-diag] falha na inicializacao:',
      error instanceof Error ? error.name : 'Erro desconhecido')
    process.exitCode = 1
  })

export default app
