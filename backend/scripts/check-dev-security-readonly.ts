import { Client } from 'pg'
import {
  assertDevAuditTarget, validateDevMetadata,
} from '../src/infrastructure/security/devPermissionContract.js'
import type {
  TablePermission, PolicyPermission,
} from '../src/infrastructure/security/devPermissionContract.js'

/**
 * Script opcional, apenas sobre os catálogos PostgreSQL do Supabase Dev.
 * Requer usuário exclusivo com SELECT em catálogos, sem direitos de escrita,
 * definido por segredo de ambiente. NÃO usa contas ou registros dos usuários.
 */
async function main(): Promise<void> {
  const connectionString = assertDevAuditTarget(process.env)
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 8_000,
    query_timeout: 12_000,
    statement_timeout: 10_000,
    application_name: 'farol-dev-security-audit',
    // Segunda barreira: nenhuma consulta nesta sessão pode gravar no banco.
    options: '-c default_transaction_read_only=on',
  })
  try {
    await client.connect()
    await client.query('BEGIN TRANSACTION READ ONLY')
    const identity = await client.query<{
      username: string; superuser: boolean; bypassrls: boolean; readonly: string
    }>(`
      SELECT current_user AS username,
        r.rolsuper AS superuser, r.rolbypassrls AS bypassrls,
        current_setting('transaction_read_only') AS readonly
      FROM pg_roles r WHERE r.rolname = current_user
    `)
    const role = identity.rows[0]
    if (!role || role.username !== 'farol_audit_ro' || role.superuser ||
        role.bypassrls || role.readonly !== 'on') {
      throw new Error('Monitor Dev sem privilégios mínimos e transação read-only.')
    }
    const tableResult = await client.query<TablePermission>(`
      SELECT c.relname::text AS table_name, c.relrowsecurity AS rls_enabled,
        has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select,
        has_table_privilege('anon', c.oid, 'INSERT') AS anon_can_insert,
        has_table_privilege('anon', c.oid, 'UPDATE') AS anon_can_update,
        has_table_privilege('anon', c.oid, 'DELETE') AS anon_can_delete,
        has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_can_select,
        has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_can_insert,
        has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_can_update,
        has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_can_delete
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `)
    const policyResult = await client.query<PolicyPermission>(`
      SELECT tablename::text, cmd::text, roles::text AS roles_text,
        qual::text, with_check::text
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `)
    const result = validateDevMetadata(tableResult.rows, policyResult.rows)
    await client.query('ROLLBACK')
    console.info(
      'Supabase Dev read-only: configuração conferida; ' +
      result.tablesReviewed + ' tabelas e ' +
      result.policiesReviewed + ' políticas verificadas.',
    )
  } finally {
    // Mesmo em erro, a conexão/read-only transaction são descartadas.
    await client.end().catch(() => {})
  }
}

main().catch(() => {
  // Não imprimir error.message nem stack de pg, que podem conter host, SQL, URL.
  console.error('Auditoria Supabase Dev não passou. Conferir configuração e permissões isoladamente.')
  process.exitCode = 1
})
