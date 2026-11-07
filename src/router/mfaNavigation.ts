/**
 * An enrolled TOTP factor enforces AAL2 through Supabase.
 * Accounts without a verified factor must enroll from /conta before
 * accessing any locally stored or cloud-backed financial interface.
 *
 * This is a UI guard only. The backend still validates AAL2 for every request.
 */
export function requiredMfaRedirect(
  path: string,
  requiresFinancialData: boolean,
  currentLevel: string | null,
  nextLevel: string | null,
): '/conta' | '/verificar-2fa' | '/' | null {
  if (nextLevel === 'aal2' && currentLevel !== 'aal2') {
    return path === '/verificar-2fa' ? null : '/verificar-2fa'
  }
  if (path === '/verificar-2fa') {
    return currentLevel === 'aal2' ? '/' : '/conta'
  }
  if (requiresFinancialData && currentLevel !== 'aal2') return '/conta'
  return null
}
