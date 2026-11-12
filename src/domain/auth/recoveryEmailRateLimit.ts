/**
 * Um HTTP 429 vindo do Supabase não indica senha errada ou falha do Farol.
 * Não supor duração do bloqueio, pois os limites variam por projeto/provedor.
 */
export class RecoveryEmailRateLimitError extends Error {
  constructor() {
    super('O Supabase atingiu o limite temporário de envio de e-mails. Não solicite vários links seguidos. Se já recebeu um link ainda não utilizado, abra-o; caso contrário, tente novamente mais tarde.')
    this.name = 'RecoveryEmailRateLimitError'
  }
}

export function recoveryEmailRequestError(error: {
  status?: number
  code?: string
  message?: string
}): Error {
  const code = String(error.code ?? '').toLowerCase()
  const message = String(error.message ?? '').toLowerCase()
  if (error.status === 429 ||
      code === 'over_email_send_rate_limit' ||
      code === 'over_request_rate_limit' ||
      /email rate limit exceeded|rate limit exceeded|too many requests|too many emails/.test(message)) {
    return new RecoveryEmailRateLimitError()
  }
  return new Error(error.message || 'Não foi possível solicitar o e-mail de recuperação. Tente novamente mais tarde.')
}
