import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('Vercel Fastify entrypoint', () => {
  it('configura framework fastify em vez do preset estático Other', () => {
    const config = JSON.parse(read('../vercel.json')) as Record<string, unknown>
    expect(config.framework).toBe('fastify')
    expect(config).not.toHaveProperty('outputDirectory')
    expect(config).not.toHaveProperty('builds')
    expect(config).not.toHaveProperty('rewrites')
  })

  it('declara framework e listen em src/app.ts, um entrypoint suportado', () => {
    const source = read('../src/app.ts')
    expect(source).toContain("import Fastify from 'fastify'")
    expect(source).toContain('Fastify({')
    expect(source).toContain('app.listen({')
    expect(source).toContain('export default app')
  })

  it('inicia Fastify no entrypoint tanto no local quanto na Vercel', () => {
    const entry = read('../src/app.ts')
    const localServer = read('../src/server.ts')
    expect(entry).toContain('void app.listen({ port, host })')
    expect(entry).not.toContain("if (process.env.VERCEL === '1') {")
    expect(localServer).toContain("import './app.js'")
    expect(localServer).not.toContain('app.listen(')
  })

  it('registra etapas de inicializacao sem imprimir credenciais', () => {
    const entry = read('../src/app.ts')
    expect(entry).toContain('[farol-api] iniciando Fastify')
    expect(entry).toContain('[farol-api] falha no cliente Prisma:')
    expect(entry).toContain('[farol-api] Fastify ouvindo; /health independente do banco')
    expect(entry).not.toContain('console.log(config)')
    expect(entry).not.toContain('console.log(process.env)')
  })
})
