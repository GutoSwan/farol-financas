import { createRemoteJWKSet, jwtVerify } from 'jose'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface AuthVerifier {
  verifyAccessToken(token: string): Promise<{ userId: string; assuranceLevel?: 'aal1' | 'aal2' }>
}

/** Verifica assinatura, expiração, emissor e público-alvo, sem aceitar chaves do cliente. */
export class SupabaseJwtVerifier implements AuthVerifier {
  private readonly issuer: string
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>

  constructor(supabaseUrl: string) {
    const base = supabaseUrl.replace(/\/$/, '')
    this.issuer = `${base}/auth/v1`
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`))
  }

  async verifyAccessToken(token: string): Promise<{ userId: string; assuranceLevel?: 'aal1' | 'aal2' }> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: 'authenticated',
      algorithms: ['RS256', 'ES256'],
      clockTolerance: 5,
    })
    if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) {
      throw new Error('Token inválido.')
    }
    // O nível de segurança vem apenas do JWT ASSINADO; ausência de AAL é aal1.
    return { userId: payload.sub, assuranceLevel: payload.aal === 'aal2' ? 'aal2' : 'aal1' }
  }
}
