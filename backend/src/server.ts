import 'dotenv/config'
import app from './app.js'
import { readConfig } from './shared/config.js'

async function main() {
  const config = readConfig(process.env)
  await app.listen({ port: config.PORT, host: config.HOST })
  app.log.info(`Farol API ouvindo em http://${config.HOST}:${config.PORT}`)
}

main().catch((error: unknown) => {
  console.error('Não foi possível iniciar a API:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
