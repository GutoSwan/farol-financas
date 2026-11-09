import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { JWTPayload } from 'jose'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface AuthVerifier {
  verifyAccessToken(token: string): Promise<{ userId: string; assuranceLevel?: 'aal1' | 'aal2' }>
}

export type ActiveSessionChecker = (userId: string, sessionId: string) => Promise<boolean>

/** Valida claims somente DEPOIS de jwtVerify ter conferido assinatura e expiração. */
export async function validateSignedSessionClaims(
  claims: JWTPayload,
  checkActiveSession: ActiveSessionChecker,
): Promise<{ userId: string; assuranceLevel: 'aal1' | 'aal2' }> {
  const userId = claims.sub
  const sessionId = claims.session_id
  if (typeof userId !== 'string' || !UUID.test(userId) ||
      typeof sessionId !== 'string' || !UUID.test(sessionId) ||
      claims.role !== 'authenticated' || claims.is_anonymous === true) {
    throw new Error('Token inválido.')
  }
  // Se o banco estiver indisponível, negar acesso em vez de aceitar JWT revogado.
  if (!await checkActiveSession(userId, sessionId)) {
    throw new Error('Sessão revogada ou expirada.')
  }
  return { userId, assuranceLevel: claims.aal === 'aal2' ? 'aal2' : 'aal1' }
}

/**
 * Verifica assinatura, expiração, emissor, público-alvo e sessão ativa.
 * Não aceita validar sessão exclusivamente por JWT: mesmo assinado, um JWT pode
 * continuar válido depois do logout até seu exp.
 */
export class SupabaseJwtVerifier implements AuthVerifier {
  private readonly issuer: string
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>

  constructor(supabaseUrl: string, private readonly checkActiveSession: ActiveSessionChecker) {
    const base = supabaseUrl.replace(/\/$/, '')
    this.issuer = `${base}/auth/v1`
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`))
  }

  async verifyAccessToken(token: string): Promise<{ userId: string; assuranceLevel: 'aal1' | 'aal2' }> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: 'authenticated',
      algorithms: ['RS256', 'ES256'],
      clockTolerance: 5,
    })
    return validateSignedSessionClaims(payload, this.checkActiveSession)
  }
}
