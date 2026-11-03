import type { IncomingMessage, ServerResponse } from 'node:http'
import app from './app.js'
let readyPromise: Promise<void> | undefined

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    readyPromise ??= new Promise<void>((resolve, reject) => {
      app.ready((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    await readyPromise
    app.routing(req, res)
  } catch (error: unknown) {
    console.error('[farol-api] falha Function nativa:', error instanceof Error ? error.name : 'erro desconhecido')
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'Erro interno do servidor.' }))
    }
  }
}
