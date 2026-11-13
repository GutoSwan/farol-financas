/**
 * Reutilização curta de autorização para as abas principais.
 *
 * A entrada só pode ser criada DEPOIS de validar getUser remoto, MFA AAL2
 * e vínculo local. Sem sessão correspondente, expiração ou revalidação, nega.
 * Nunca usar para backup, migração, Presentes, Admin ou recuperação de senha.
 */
const SIDEBAR_PATHS = new Set([
  '/', '/contas-mensais', '/gastos-fixos', '/lancamentos',
  '/cartoes', '/orcamentos', '/relatorios', '/calendario',
])
export const MAX_SIDEBAR_AUTH_AGE_MS = 45_000
const TOKEN_EXPIRY_MARGIN_MS = 30_000

export interface VerifiedSidebarAuth {
  userId: string
  accessToken: string
  expiresAt: number
  verifiedAt: number
}
export interface CurrentSidebarSession {
  userId: string
  accessToken: string
  expiresAt: number | null
}
export function isFastSidebarPath(path: string): boolean {
  return SIDEBAR_PATHS.has(path)
}
export function canReuseSidebarAuth(
  trusted: VerifiedSidebarAuth,
  current: CurrentSidebarSession,
  now = Date.now(),
): boolean {
  return Number.isFinite(now) &&
    Number.isFinite(trusted.verifiedAt) &&
    now >= trusted.verifiedAt &&
    now - trusted.verifiedAt <= MAX_SIDEBAR_AUTH_AGE_MS &&
    trusted.userId.length > 0 && current.userId === trusted.userId &&
    trusted.accessToken.length > 0 && current.accessToken === trusted.accessToken &&
    Number.isFinite(trusted.expiresAt) &&
    typeof current.expiresAt === 'number' && Number.isFinite(current.expiresAt) &&
    trusted.expiresAt === current.expiresAt &&
    current.expiresAt * 1000 > now + TOKEN_EXPIRY_MARGIN_MS
}
