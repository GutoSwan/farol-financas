import { describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

function unusedLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Porta local indisponível'))
        return
      }
      server.close(() => resolve(address.port))
    })
  })
}

describe('Health da API independente de PostgreSQL e JWT', () => {
  it('responde health=200, ready=503 e me=401 sem credenciais no processo', async () => {
    const port = await unusedLocalPort()
    const cwd = fileURLToPath(new URL('../', import.meta.url))
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
      cwd,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        VERCEL: '',
        PORT: String(port),
        HOST: '127.0.0.1',
        DATABASE_URL: '',
        SUPABASE_URL: '',
        CORS_ORIGIN: 'http://localhost:5173',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString().slice(0, 2000) })
    try {
      let response: Response | undefined
      for (let attempt = 0; attempt < 55; attempt++) {
        if (child.exitCode !== null) throw new Error('Processo encerrou antes do health: ' + stderr)
        try {
          response = await fetch(`http://127.0.0.1:${port}/api/v1/health`)
          break
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 120))
        }
      }
      expect(response, 'Servidor Fastify não iniciou: ' + stderr).toBeDefined()
      expect(response?.status).toBe(200)
      expect(await response?.json()).toMatchObject({ status: 'ok', service: 'farol-api' })
      const ready = await fetch(`http://127.0.0.1:${port}/api/v1/ready`)
      expect(ready.status).toBe(503)
      expect(await ready.json()).toEqual({ status: 'unavailable' })
      const me = await fetch(`http://127.0.0.1:${port}/api/v1/me`)
      expect(me.status).toBe(401)
    } finally {
      child.kill()
    }
  }, 15000)
})
