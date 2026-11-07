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
    return direct || pooler
  } catch {
    return false
  }
}
