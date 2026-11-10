import { describe, expect, it } from 'vitest'
import {
  assertDevAuditTarget, FINANCIAL_TABLES, validateDevMetadata,
} from '../src/infrastructure/security/devPermissionContract.js'
import type {
  TablePermission, PolicyPermission,
} from '../src/infrastructure/security/devPermissionContract.js'

const REF = 'tvirkrjkgdtybtcundon'
const PROD = 'xwzbcabyjhmgggbkaxvt'
const TEST_PASSWORD = 'not-a-real-secret'
const database = 'postgresql://farol_audit_ro:'+TEST_PASSWORD+'@db.'+REF+'.supabase.co:5432/postgres?sslmode=verify-full'
const env = {
  FAROL_DEV_SUPABASE_REF: REF,
  FAROL_DEV_READONLY_AUDIT: 'true',
  SUPABASE_URL: 'https://' + REF + '.supabase.co',
  FAROL_DEV_READONLY_DATABASE_URL: database,
}

function table(name: string): TablePermission {
  return {
    table_name: name, rls_enabled: true,
    anon_can_select: false, anon_can_insert: false,
    anon_can_update: false, anon_can_delete: false,
    authenticated_can_select: false, authenticated_can_insert: false,
    authenticated_can_update: false, authenticated_can_delete: false,
  }
}
const owner = '(( SELECT auth.uid() AS uid) = user_id)'
function policy(cmd: string): PolicyPermission {
  return {
    tablename: 'calendar_events', cmd,
    roles_text: '{authenticated}',
    qual: cmd === 'INSERT' ? null : owner,
    with_check: ['INSERT', 'UPDATE'].includes(cmd) ? owner : null,
  }
}
const validPolicies = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map(policy)
const validTables = [...FINANCIAL_TABLES, 'calendar_events'].map(table)

describe('Contrato live Dev Supabase: introspecção somente leitura', () => {
  it('aceita política de calendário por titular e tabelas financeiras bloqueadas ao cliente', () => {
    expect(validateDevMetadata(validTables, validPolicies)).toEqual({
      tablesReviewed: 13,
      policiesReviewed: 4,
    })
  })

  it('detecta tabela sem RLS ou ausente', () => {
    expect(() => validateDevMetadata(validTables.filter(t => t.table_name !== 'Workspace'), validPolicies))
      .toThrow('RLS ausente')
    expect(() => validateDevMetadata(validTables.map(t => t.table_name === 'Workspace' ?
      { ...t, rls_enabled: false } : t), validPolicies)).toThrow('RLS ausente')
  })

  it('detecta qualquer GRANT acidental a anon, authenticated ou PUBLIC', () => {
    for (const privilege of ['anon_can_select', 'authenticated_can_insert',
      'authenticated_can_update', 'anon_can_delete'] as const) {
      const changed = validTables.map(t => t.table_name === 'Transaction' ?
        { ...t, [privilege]: true } : t)
      expect(() => validateDevMetadata(changed, validPolicies)).toThrow('Privilégio direto')
    }
  })

  it('recusa política permissiva, aberta a anon, com OR TRUE ou without check', () => {
    const variants: PolicyPermission[][] = [
      validPolicies.map(p => p.cmd === 'SELECT' ? { ...p, qual: 'true' } : p),
      validPolicies.map(p => p.cmd === 'SELECT' ?
        { ...p, qual: '(( SELECT auth.uid() AS uid) = user_id) OR true' } : p),
      validPolicies.map(p => p.cmd === 'UPDATE' ? { ...p, with_check: null } : p),
      validPolicies.map(p => p.cmd === 'INSERT' ? { ...p, roles_text: '{anon,authenticated}' } : p),
      validPolicies.filter(p => p.cmd !== 'DELETE'),
      [...validPolicies, { tablename: 'calendar_events', cmd: 'ALL',
        roles_text: '{public}', qual: 'true', with_check: 'true' }],
    ]
    for (const changed of variants) {
      expect(() => validateDevMetadata(validTables, changed)).toThrow()
    }
  })

  it('reprova exposição de histórico interno de migrações quando existir', () => {
    expect(validateDevMetadata([...validTables, table('_prisma_migrations')], validPolicies).tablesReviewed).toBe(14)
    expect(() => validateDevMetadata([...validTables, {
      ...table('_prisma_migrations'), anon_can_select: true,
    }], validPolicies)).toThrow('Prisma')
  })

  it('rejeita host Prod, prefixo enganoso e conta postgres poderosa', () => {
    const cases = [
      { ...env, FAROL_DEV_READONLY_AUDIT: 'false' },
      { ...env, FAROL_DEV_SUPABASE_REF: PROD },
      { ...env, SUPABASE_URL: 'https://' + PROD + '.supabase.co' },
      { ...env, FAROL_DEV_READONLY_DATABASE_URL:
        database.replace('db.' + REF, 'db.' + PROD) },
      { ...env, FAROL_DEV_READONLY_DATABASE_URL:
        database.replace('db.' + REF + '.supabase.co', 'db.' + REF + '.supabase.co.evil.test') },
      { ...env, FAROL_DEV_READONLY_DATABASE_URL:
        database.replace('farol_audit_ro', 'postgres') },
      { ...env, FAROL_DEV_READONLY_DATABASE_URL:
        database.replace('sslmode=verify-full', 'sslmode=require') },
      { ...env, FAROL_DEV_READONLY_DATABASE_URL:
        database.replace('postgresql:', 'http:') },
      { ...env, FAROL_DEV_READONLY_DATABASE_URL: undefined },
    ]
    for (const candidate of cases) expect(() => assertDevAuditTarget(candidate)).toThrow()
  })

  it('aceita a origem Dev estrita e o papel exclusivo de auditoria', () => {
    expect(assertDevAuditTarget(env)).toBe(database)
    const pooler = database
      .replace('farol_audit_ro:', 'farol_audit_ro.' + REF + ':')
      .replace('db.' + REF + '.supabase.co', 'aws-0-sa-east-1.pooler.supabase.com')
    expect(assertDevAuditTarget({ ...env, FAROL_DEV_READONLY_DATABASE_URL: pooler })).toBe(pooler)
  })
})
