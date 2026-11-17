/**
 * Checagem gratuita para novas senhas, independente do plano do Supabase.
 * A senha e seu hash completo nunca são enviados ao serviço de vazamentos.
 * A validação no navegador complementa (não substitui) a política do Supabase Auth.
 */
export const MIN_NEW_PASSWORD_LENGTH = 12
const MAX_NEW_PASSWORD_BYTES = 72
const PWNED_PASSWORDS_ENDPOINT = 'https://api.pwnedpasswords.com/range/'

export function validateNewPassword(password: string): void {
  if (Array.from(password).length < MIN_NEW_PASSWORD_LENGTH) {
    throw new Error(`Use uma senha com pelo menos ${MIN_NEW_PASSWORD_LENGTH} caracteres.`)
  }
  if (new TextEncoder().encode(password).length > MAX_NEW_PASSWORD_BYTES) {
    throw new Error('Use uma senha com no máximo 72 bytes (alguns símbolos ocupam mais de um byte).')
  }
}

/** API pública e gratuita: k-anonimato, SHA-1 apenas para consulta local. */
export async function assertPasswordNotLeaked(password: string): Promise<void> {
  validateNewPassword(password)

  try {
    const bytes = new TextEncoder().encode(password)
    const digest = await crypto.subtle.digest('SHA-1', bytes)
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0'))
      .join('').toUpperCase()
    const prefix = hash.slice(0, 5)
    const suffix = hash.slice(5)
    const response = await fetch(`${PWNED_PASSWORDS_ENDPOINT}${prefix}`, {
      method: 'GET',
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(10000),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('unavailable')

    const range = await response.text()
    for (const line of range.split(/\r?\n/)) {
      const [candidate, count] = line.trim().split(':')
      if (candidate?.toUpperCase() === suffix && Number(count) > 0) {
        throw new LeakedPasswordError()
      }
    }
  } catch (error) {
    if (error instanceof LeakedPasswordError) throw error
    // Não permitir o cadastro de uma senha sem que a verificação seja concluída.
    throw new Error('Não foi possível verificar a segurança da senha. Confira a conexão e tente novamente.')
  }
}

export class LeakedPasswordError extends Error {
  constructor() {
    super('Esta senha já apareceu em vazamentos. Escolha outra senha, exclusiva para o Farol.')
    this.name = 'LeakedPasswordError'
  }
}
