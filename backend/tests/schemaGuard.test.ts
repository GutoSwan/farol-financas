import { describe, expect, it } from 'vitest'
import { isMigrationMetadataExposed } from '../src/infrastructure/security/schemaGuard.js'

describe('Proteção do histórico de migrações Prisma', () => {
  it('rejeita tabela pública sem RLS com grants a papéis de cliente', () => {
    expect(isMigrationMetadataExposed(false, true)).toBe(true)
  })
  it('não sinaliza tabela isolada sem grants a clientes', () => {
    expect(isMigrationMetadataExposed(false, false)).toBe(false)
  })
  it('não aceita grants públicos nem quando o metadata tem RLS', () => {
    expect(isMigrationMetadataExposed(true, true)).toBe(true)
    expect(isMigrationMetadataExposed(true, false)).toBe(false)
  })
})
