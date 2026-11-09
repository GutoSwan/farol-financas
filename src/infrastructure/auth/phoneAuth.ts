import { supabase } from './supabase'

/**
 * Phone OTP is opt-in until an SMS provider, CAPTCHA and rate limits are
 * configured in Supabase Dev. NEVER use an admin key in the browser.
 */
export const phoneAuthEnabled = import.meta.env.VITE_ENABLE_PHONE_AUTH === 'true'

/** Brazilian mobile phone number (E.164), accepts 11 digit mobile / DDD.
 * Explicitly avoid guessing country codes for foreign numbers.
 */
export function normalizeBrazilianMobile(input: string): string {
  const raw = input.trim()
  if (!/^[+()\d\s-]+$/.test(raw)) throw new Error('Digite um número de celular válido.')
  const digits = raw.replace(/\D/g, '')
  const local = digits.startsWith('55') && digits.length === 13 ? digits.slice(2) : digits
  if (!/^[1-9][0-9]9[0-9]{8}$/.test(local) || local.startsWith('00')) {
    throw new Error('Informe um celular brasileiro com DDD, como (15) 99999-9999.')
  }
  return '+55' + local
}

export type PhoneFlow = 'login' | 'signup' | 'recovery'

function assertReady() {
  if (!phoneAuthEnabled) throw new Error('Acesso por celular ainda não ativado. Use e-mail e senha.')
  if (!supabase) throw new Error('Serviço de autenticação indisponível.')
  return supabase.auth
}

/** Never create an account while trying to log in or recover access. */
export async function sendPhoneOtp(rawPhone: string, flow: PhoneFlow): Promise<string> {
  const phone = normalizeBrazilianMobile(rawPhone)
  const auth = assertReady()
  const { error } = await auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: flow === 'signup', channel: 'sms' },
  })
  // Do not reveal whether a number is registered.
  if (error) {
    if (/rate|limit|too many|over_request/i.test(error.message)) {
      throw new Error('Muitas tentativas. Aguarde antes de solicitar outro código.')
    }
    throw new Error('Não foi possível enviar o código. Confira o número e tente mais tarde.')
  }
  return phone
}

/** Phone OTP produces an AAL1 session, NOT MFA recovery. Global router enforces TOTP. */
export async function verifyPhoneOtp(phone: string, rawCode: string): Promise<void> {
  const safePhone = normalizeBrazilianMobile(phone)
  const code = rawCode.trim()
  if (!/^\d{6,8}$/.test(code)) throw new Error('Digite o código numérico recebido por SMS.')
  const { data, error } = await assertReady().verifyOtp({
    phone: safePhone,
    token: code,
    type: 'sms',
  })
  if (error || !data.session) {
    throw new Error('Código inválido ou expirado. Solicite outro código se necessário.')
  }
}

/** Add a verified recovery/login phone ONLY from an existing session in AAL2. */
export async function requestPhoneLink(rawPhone: string): Promise<string> {
  const phone = normalizeBrazilianMobile(rawPhone)
  const auth = assertReady()
  const [identity, assurance] = await Promise.all([
    auth.getUser(), auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (identity.error || !identity.data.user || assurance.error ||
      assurance.data.currentLevel !== 'aal2') {
    throw new Error('Confirme seu autenticador atual antes de vincular um celular.')
  }
  const { error } = await auth.updateUser({ phone })
  if (error) throw new Error('Não foi possível solicitar a confirmação do celular.')
  return phone
}

/** Verifies ownership before linking phone to the currently logged-in account. */
export async function confirmPhoneLink(rawPhone: string, rawCode: string): Promise<void> {
  const phone = normalizeBrazilianMobile(rawPhone)
  const token = rawCode.trim()
  if (!/^\d{6,8}$/.test(token)) throw new Error('Digite o código recebido por SMS.')
  const auth = assertReady()
  const [identity, assurance] = await Promise.all([
    auth.getUser(), auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (identity.error || !identity.data.user || assurance.error ||
      assurance.data.currentLevel !== 'aal2') {
    throw new Error('Sessão sem 2FA. Entre novamente antes de confirmar o celular.')
  }
  const { error } = await auth.verifyOtp({ phone, token, type: 'phone_change' })
  if (error) throw new Error('Código inválido ou expirado. O celular não foi vinculado.')
}
