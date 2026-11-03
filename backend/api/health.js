import Fastify from 'fastify'

const app = Fastify({ logger: false })
app.get('/api/health', async () => ({ diagnostic: 'fastify-native-handler', status: 'ok' }))
let ready

export default async function handler(req, res) {
  console.info('[farol-diag-native] requisicao recebida', req.method, req.url)
  try {
    ready ??= app.ready()
    await ready
    app.routing(req, res)
  } catch (error) {
    console.error('[farol-diag-native] falha:', error instanceof Error ? error.name : 'erro desconhecido')
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ diagnostic: 'fastify-native-handler', status: 'error' }))
    }
  }
}
