/**
 * Contrato de metadados para verificação SOMENTE LEITURA do Supabase Dev.
 * As tabelas financeiras são acessadas pela API confiável (Prisma), não pelo
 * PostgREST diretamente. Nunca confundir RLS ativada com autorização completa.
 */
export const FINANCIAL_TABLES = [
  'User', 'Workspace', 'WorkspaceMember', 'RecurringBill', 'MonthlyBillEntry',
  'FixedExpense', 'FixedExpensePayment', 'Transaction', 'BudgetProject',
  'BudgetItem', 'BudgetQuote', 'invoice_documents',
] as const

export interface TablePermission {
  table_name: string
  rls_enabled: boolean
  anon_can_select: boolean
  anon_can_insert: boolean
  anon_can_update: boolean
  anon_can_delete: boolean
  authenticated_can_select: boolean
  authenticated_can_insert: boolean
  authenticated_can_update: boolean
  authenticated_can_delete: boolean
}
export interface PolicyPermission {
  tablename: string
  cmd: string
  roles_text: string
  qual: string | null
  with_check: string | null
}
export interface MetadataAudit {
  tablesReviewed: number
  policiesReviewed: number
}

const PRIVILEGES = [
  'anon_can_select', 'anon_can_insert', 'anon_can_update', 'anon_can_delete',
  'authenticated_can_select', 'authenticated_can_insert',
  'authenticated_can_update', 'authenticated_can_delete',
] as const

function boundToOwner(expression: string | null): boolean {
  if (typeof expression !== 'string') return false
  // Falhar fechado diante de qualquer OR, cláusula extra ou função diferente.
  const normalized = expression.toLowerCase().replace(/[()\s]/g, '')
  return normalized === 'selectauth.uidasuid=user_id' ||
    normalized === 'user_id=selectauth.uidasuid' ||
    normalized === 'auth.uid=user_id' ||
    normalized === 'user_id=auth.uid'
}

/**
 * Exige política individual SELECT/INSERT/UPDATE/DELETE com user_id = auth.uid,
 * e WITH CHECK para INSERT e UPDATE. Alterações de políticas exigem revisão.
 */
export function validateDevMetadata(
  tables: readonly TablePermission[], policies: readonly PolicyPermission[],
): MetadataAudit {
  const byName = new Map(tables.map(table => [table.table_name, table]))
  if (byName.size !== tables.length) throw new Error('Metadados duplicados de tabelas.')
  for (const name of FINANCIAL_TABLES) {
    const table = byName.get(name)
    if (!table?.rls_enabled) throw new Error('RLS ausente: ' + name)
    for (const privilege of PRIVILEGES) {
      if (table[privilege] !== false) {
        throw new Error('Privilégio direto não permitido: ' + name + ' / ' + privilege)
      }
    }
  }
  const calendar = byName.get('calendar_events')
  if (!calendar?.rls_enabled) throw new Error('Calendário sem RLS.')
  for (const command of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    const matches = policies.filter(policy =>
      policy.tablename === 'calendar_events' && policy.cmd === command)
    if (matches.length !== 1) {
      throw new Error('Política inesperada para calendário: ' + command)
    }
    const policy = matches[0]
    if (policy.roles_text !== '{authenticated}') {
      throw new Error('Calendário acessível por papel não autorizado: ' + command)
    }
    if (command !== 'INSERT' && !boundToOwner(policy.qual)) {
      throw new Error('Calendário sem filtro de titular: ' + command)
    }
    if ((command === 'UPDATE' || command === 'INSERT') &&
        !boundToOwner(policy.with_check)) {
      throw new Error('Calendário sem proteção de escrita: ' + command)
    }
  }
  if (policies.some(policy => policy.tablename === 'calendar_events' &&
      !['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(policy.cmd))) {
    throw new Error('Calendário com política genérica não revisada.')
  }
  // Não permitir que tabelas administrativas do Prisma fiquem acessíveis.
  const migrations = byName.get('_prisma_migrations')
  if (migrations && PRIVILEGES.some(privilege => migrations[privilege] !== false)) {
    throw new Error('Metadados internos do Prisma expostos a clientes.')
  }
  return { tablesReviewed: tables.length, policiesReviewed: policies.length }
}

/** Proteção antes de qualquer conexão: recusar Prod, superusuário e URL indevida. */
export function assertDevAuditTarget(env: Record<string, string | undefined>): string {
  const ref = 'tvirkrjkgdtybtcundon'
  if (env.FAROL_DEV_SUPABASE_REF !== ref ||
      env.FAROL_DEV_READONLY_AUDIT !== 'true' ||
      env.SUPABASE_URL !== 'https://' + ref + '.supabase.co') {
    throw new Error('Monitoramento Dev não autorizado ou apontando para outro projeto.')
  }
  const raw = env.FAROL_DEV_READONLY_DATABASE_URL
  if (!raw || raw.length > 1024) throw new Error('Credencial exclusiva de leitura não configurada.')
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('Conexão Dev inválida.') }
  const user = decodeURIComponent(url.username)
  const direct = url.hostname === 'db.' + ref + '.supabase.co' && user === 'farol_audit_ro'
  const pooler = url.hostname.endsWith('.pooler.supabase.com') &&
    user === 'farol_audit_ro.' + ref
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || (!direct && !pooler) ||
      !url.password || url.hash || url.searchParams.get('sslmode') !== 'verify-full' ||
      (url.port && !['5432', '6543'].includes(url.port))) {
    throw new Error('A conexão precisa usar a conta farol_audit_ro do projeto Dev, com TLS verificado.')
  }
  return raw
}
