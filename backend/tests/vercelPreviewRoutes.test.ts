import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** Regression: Vercel does not automatically route arbitrary Fastify paths
 * through top-level /api/v1/workspaces.ts. Each dynamic route needs a
 * corresponding deployed Function entrypoint. */
describe('Vercel Fastify dynamic financial routes', () => {
  it('exposes the per-workspace metadata endpoint', () => {
    const source = readFileSync('api/v1/workspaces/[workspaceId].ts', 'utf8')
    expect(source).toContain("export { default } from '../../../src/native-handler.js'")
  })

  it('exposes nested finance modules through the native Fastify handler', () => {
    const source = readFileSync('api/v1/workspaces/[workspaceId]/[kind].ts', 'utf8')
    expect(source).toContain("export { default } from '../../../../src/native-handler.js'")
  })
})
