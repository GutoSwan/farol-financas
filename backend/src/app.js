import Fastify from 'fastify'

// Teste independente: sem Prisma, Supabase, banco, TypeScript ou plugins.
console.info('[fastify-isolado] carregando entrypoint')
const app = Fastify({ logger: true })
app.get('/', async () => ({ diagnostic: 'fastify-clean-isolated', status: 'ok' }))
app.get('/health', async () => ({ diagnostic: 'fastify-clean-isolated', status: 'ok' }))
app.get('/api/v1/health', async () => ({ diagnostic: 'fastify-clean-isolated', status: 'ok' }))

const port = Number(process.env.PORT || 3000)
app.listen({ port, host: '0.0.0.0' })
  .then(() => console.info('[fastify-isolado] ouvindo', port))
  .catch((error) => {
    console.error('[fastify-isolado] erro ao iniciar:', error)
    process.exitCode = 1
  })

export default app
