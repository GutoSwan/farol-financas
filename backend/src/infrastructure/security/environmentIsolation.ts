/**
 * Fail-closed guard for Vercel Preview. No database or secrets are printed.
 *
 * We only accept a Supabase hosted project URL matching the expected Dev ref,
 * and a PostgreSQL connection whose host or username contains the same ref.
 * This is a guard against accidental prod connection, not a substitute for
 * separate credentials and role-scoped database privileges.
 */
export function isVerifiedDevPreviewEnvironment(env: NodeJS.ProcessEnv): boolean {
  if (env.VERCEL_ENV !== 'preview') return true

  const ref = env.FAROL_DEV_SUPABASE_REF ?? ''
  if (!/^[a-z0-9]{20}$/.test(ref)) return false

  try {
    const supabase = new URL(env.SUPABASE_URL ?? '')
    const database = new URL(env.DATABASE_URL ?? '')
    if (supabase.protocol !== 'https:' || supabase.hostname !== ref + '.supabase.co' ||
        supabase.pathname !== '/' || database.protocol !== 'postgresql:' &&
        database.protocol !== 'postgres:') return false

    // Direct: db.<ref>.supabase.co, pooler: postgres.<ref>@*.pooler.supabase.com
    const direct = database.hostname === 'db.' + ref + '.supabase.co'
    const pooler = database.hostname.endsWith('.pooler.supabase.com') &&
      decodeURIComponent(database.username) === 'postgres.' + ref
    // QA financeiro isolado: somente role de leitura do Supabase Dev (nunca postgres).
    // O papel também tem RLS SELECT apenas nas 11 tabelas financeiras permitidas.
    // Nunca autoriza escrita financeira na Preview, mesmo por requisição direta.
    if (env.FAROL_PREVIEW_ADMIN_QA_READONLY === 'true') {
      return ref === 'tvirkrjkgdtybtcundon' &&
        database.hostname.endsWith('.pooler.supabase.com') &&
        database.port === '6543' &&
        database.pathname === '/postgres' &&
        database.password.length >= 24 &&
        decodeURIComponent(database.username) === 'farol_preview_adminqa_ro.' + ref &&
        env.FAROL_FINANCIAL_WRITES_ENABLED !== 'true' &&
        env.FAROL_INVOICE_UPLOADS_ENABLED !== 'true'
    }
    return direct || pooler
  } catch {
    return false
  }
}

/**
 * Diagnóstico codificado e não sensível: nunca imprime URL, usuário completo,
 * senha ou segredo. Usado apenas nos logs privados de /ready.
 */
export function readonlyQaConfigIssue(env: NodeJS.ProcessEnv): string {
  if (env.FAROL_PREVIEW_ADMIN_QA_READONLY !== 'true') return 'qa-mode-not-enabled'
  if (env.FAROL_DEV_SUPABASE_REF !== 'tvirkrjkgdtybtcundon') return 'unexpected-dev-project'
  if (env.FAROL_FINANCIAL_WRITES_ENABLED === 'true' ||
      env.FAROL_INVOICE_UPLOADS_ENABLED === 'true') return 'financial-writes-enabled'
  try {
    const supabase = new URL(env.SUPABASE_URL ?? '')
    if (supabase.origin !== 'https://tvirkrjkgdtybtcundon.supabase.co' ||
        supabase.pathname !== '/') return 'supabase-dev-url'
    const db = new URL(env.DATABASE_URL ?? '')
    if (!['postgresql:','postgres:'].includes(db.protocol)) return 'db-protocol'
    if (!db.hostname.endsWith('.pooler.supabase.com')) return 'db-not-supabase-pooler'
    if (db.port !== '6543') return 'db-not-transaction-pooler'
    if (db.pathname !== '/postgres') return 'db-name'
    if (decodeURIComponent(db.username) !== 'farol_preview_adminqa_ro.tvirkrjkgdtybtcundon')
      return 'db-role-not-readonly'
    if (db.password.length < 24) return 'db-password-missing-or-short'
    return 'unexpected-guard-mismatch'
  } catch { return 'db-connection-url-invalid' }
}
