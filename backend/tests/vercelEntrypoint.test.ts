import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('Vercel Fastify entrypoint', () => {
  it('fixa Node.js 22.x no backend', () => {
    const pkg = JSON.parse(read('../package.json')) as { engines?: { node?: string } }
    expect(pkg.engines?.node).toBe('22.x')
  })

  it('mantém o preset automático compatível com src/app.ts', () => {
    const config = JSON.parse(read('../vercel.json')) as Record<string, unknown>
    expect(config.framework).toBe(null)
    expect(config.buildCommand).toBe('npm run build')
    expect(config).not.toHaveProperty('functions')
    expect(config).not.toHaveProperty('builds')
    expect(config).not.toHaveProperty('rewrites')
  })

  it('exporta a instância Fastify sem abrir porta na Vercel', () => {
    const source = read('../src/app.ts')
    expect(source).toContain("import Fastify from 'fastify'")
    expect(source).toContain('Fastify({')
    expect(source).toContain('export default app')
    expect(source).not.toContain('app.listen(')
  })

  it('abre porta apenas no server.ts local', () => {
    const entry = read('../src/app.ts')
    const localServer = read('../src/server.ts')
    expect(entry).not.toContain('app.listen(')
    expect(localServer).toContain("import app from './app.js'")
    expect(localServer).toContain('void app.listen({ port, host })')
  })

  it('não registra credenciais nos logs de inicialização', () => {
    const entry = read('../src/app.ts')
    expect(entry).toContain('[farol-api] iniciando Fastify')
    expect(entry).toContain('[farol-api] falha no cliente Prisma:')
    expect(entry).not.toContain('console.log(config)')
    expect(entry).not.toContain('console.log(process.env)')
  })
})
