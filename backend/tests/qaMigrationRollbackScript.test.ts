import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../sql/qa_legacy_migration_rollback_dev.sql', import.meta.url), 'utf8',
)

describe('Teste reversível de migração no banco Dev', () => {
  it('sempre abre transação e termina com ROLLBACK, sem COMMIT', () => {
    expect(sql).toContain('EXCLUSIVAMENTE SUPABASE DEV (tvirkrjkgdtybtcundon)')
    expect(sql).toMatch(/\bBEGIN;/)
    expect(sql.trimEnd()).toMatch(/ROLLBACK;$/)
    expect(sql).not.toMatch(/\bCOMMIT\s*;/i)
    expect(sql).toContain("SET LOCAL lock_timeout = '3s'")
  })

  it('usa identidades sintéticas e verifica vínculos e falhas esperadas', () => {
    expect(sql).toContain('owner_id uuid := gen_random_uuid()')
    expect(sql).toContain('viewer_id uuid := gen_random_uuid()')
    expect(sql).toContain('QA: VIEWER recebeu permissão de proprietário')
    expect(sql).toContain('QA: data desconhecida do pagamento foi inventada')
    expect(sql).toContain('EXCEPTION WHEN unique_violation')
    expect(sql).toContain('EXCEPTION WHEN foreign_key_violation')
    expect(sql).toContain('QA_DEV_ROLLBACK_PASS')
  })
})
