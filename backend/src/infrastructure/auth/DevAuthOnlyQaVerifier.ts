import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { JWTPayload } from 'jose'
import type { AuthVerifier } from './SupabaseJwtVerifier.js'

const DEV = 'https://tvirkrjkgdtybtcundon.supabase.co'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** QA only. All Supabase Auth reads use the caller's own signed access token. */
export function isVerifiedAuthOnlyDevPreview(env: NodeJS.ProcessEnv): boolean {
  if (env.VERCEL_ENV !== 'preview' ||
      env.FAROL_PREVIEW_ADMIN_QA_AUTH_ONLY !== 'true' ||
      env.FAROL_PREVIEW_ADMIN_QA_READONLY !== 'true' ||
      env.SUPABASE_URL !== DEV ||
      env.FAROL_DEV_SUPABASE_REF !== 'tvirkrjkgdtybtcundon' ||
      !/^sb_publishable_[a-zA-Z0-9_-]{15,}$/.test(env.SUPABASE_PUBLISHABLE_KEY ?? '') ||
      env.FAROL_FINANCIAL_WRITES_ENABLED === 'true' ||
      env.FAROL_INVOICE_UPLOADS_ENABLED === 'true' ||
      env.FAROL_INVOICE_READS_ENABLED === 'true') return false
  try {
    const origin = new URL(env.CORS_ORIGIN ?? '')
    return origin.protocol === 'https:' &&
      origin.username === '' && origin.password === '' &&
      origin.hostname.endsWith('.vercel.app') &&
      origin.pathname === '/' && !origin.search && !origin.hash
  } catch { return false }
}

export function validQaClaims(claims: JWTPayload): { userId: string; level: 'aal1' | 'aal2' } {
  if (typeof claims.sub !== 'string' || !UUID.test(claims.sub) ||
      typeof claims.session_id !== 'string' || !UUID.test(claims.session_id) ||
      claims.role !== 'authenticated' || claims.is_anonymous === true ||
      (claims.aal !== 'aal1' && claims.aal !== 'aal2')) {
    throw new Error('Sessão inválida.')
  }
  return { userId: claims.sub, level: claims.aal }
}

interface AuthUser {
  id?: unknown
  email_confirmed_at?: unknown
  app_metadata?: { farol_role?: unknown }
  is_anonymous?: unknown
  factors?: unknown
}
function asAuthUser(value: unknown): AuthUser | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as AuthUser : null
}
function verifiedTotp(factors: unknown): boolean {
  if (!Array.isArray(factors)) return false
  return factors.some((factor: unknown) => {
    if (!factor || typeof factor !== 'object') return false
    const f = factor as { factor_type?: unknown; status?: unknown }
    return f.factor_type === 'totp' && f.status === 'verified'
  })
}

/**
 * Temporary, strictly read-only QA verifier.
 * Uses Supabase's signed JWKS and the /auth/v1/user endpoint with the caller token.
 * It DOES NOT guarantee immediate session revocation after logout; unlike the
 * production Prisma-based verifier. Never enable this mode on Production or on
 * endpoints that read/write financial information.
 */
export class DevAuthOnlyQaVerifier implements AuthVerifier {
  private readonly jwks = createRemoteJWKSet(new URL(DEV + '/auth/v1/.well-known/jwks.json'))
  constructor(private readonly publishableKey: string,
    private readonly request: typeof fetch = fetch) {}

  private async getAuth(token: string): Promise<unknown> {
    if (!/^[A-Za-z0-9._-]{40,8192}$/.test(token)) throw new Error('Token inválido.')
    const res = await this.request(DEV + '/auth/v1/user', {
      method: 'GET',
      redirect: 'error',
      headers: {
        'apikey': this.publishableKey,
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(7000),
    })
    if (!res.ok) throw new Error('Sessão não confirmada pelo Supabase Dev.')
    return res.json() as Promise<unknown>
  }

  async verifyAccessToken(token: string): Promise<{ userId: string; assuranceLevel: 'aal1' | 'aal2' }> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: DEV + '/auth/v1',
      audience: 'authenticated',
      algorithms: ['RS256', 'ES256'],
      clockTolerance: 5,
    })
    const verified = validQaClaims(payload)
    const current = asAuthUser(await this.getAuth(token))
    if (!current || current.id !== verified.userId ||
        typeof current.email_confirmed_at !== 'string' ||
        current.is_anonymous === true) throw new Error('Conta de teste não autorizada.')
    return { userId: verified.userId, assuranceLevel: verified.level }
  }

  async checkSuperAdmin(userId: string, token?: string): Promise<boolean> {
    if (!UUID.test(userId) || !token) return false
    try {
      const user = asAuthUser(await this.getAuth('/user', token))
      if (!user || user.id !== userId || typeof user.email_confirmed_at !== 'string' ||
          user.is_anonymous === true || user.app_metadata?.farol_role !== 'super_admin') return false
      return verifiedTotp(user.factors)
    } catch { return false }
  }

  async ready(): Promise<boolean> {
    try {
      const response = await this.request(DEV + '/auth/v1/health', {
        method: 'GET', redirect: 'error',
        headers: { apikey: this.publishableKey },
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch { return false }
  }
}
