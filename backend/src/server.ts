import app from './app.js'
const requestedPort = Number(process.env.PORT ?? 3333)
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536 ? requestedPort : 3333
const host = process.env.HOST ?? '127.0.0.1'
void app.listen({ port, host }).then(() => console.info('[farol-api] servidor local iniciado'))
  .catch((error: unknown) => {
    console.error('[farol-api] erro ao iniciar:', error instanceof Error ? error.name : 'Erro desconhecido')
    process.exitCode = 1
  })
