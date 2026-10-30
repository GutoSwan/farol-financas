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
})
