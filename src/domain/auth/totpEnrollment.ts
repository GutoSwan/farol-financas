export type TotpFactorStatus = 'verified' | 'unverified'

export interface TotpFactorSummary {
  id: string
  status: string
}

export interface AuthFactorSummary extends TotpFactorSummary {
  factor_type: string
}

/** Supabase retorna fatores verificados em `totp`, mas os pendentes apenas em `all`. */
export function allTotpFactors(factors: readonly AuthFactorSummary[]): TotpFactorSummary[] {
  return factors.filter(factor => factor.factor_type === 'totp')
}

export type TotpSetupAvailability = 'active' | 'incomplete' | 'available'

/** Um fator ainda não confirmado nunca é tratado como MFA ativo. */
export function totpSetupAvailability(factors: readonly TotpFactorSummary[]): TotpSetupAvailability {
  if (factors.some(factor => factor.status === 'verified')) return 'active'
  if (factors.some(factor => factor.status === 'unverified')) return 'incomplete'
  return 'available'
}

export function isTotpCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim())
}

/** O QR precisa vir como imagem incorporada; nunca aceitar URLs externas ou javascript:. */
export function safeTotpQrImage(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const uri = value.trim()
  if (!/^data:image\/(?:svg\+xml|png);(?:utf-8|charset=utf-8|base64),/i.test(uri)) return null
  if (uri.length > 150_000) return null
  return uri
}
