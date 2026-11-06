import { supabase } from './supabase'

function requireClient() {
  if (!supabase) throw new Error('A autenticação ainda não foi configurada.')
  return supabase
}

function validCode(code: string): string {
  const normalized = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(normalized)) throw new Error('Informe os seis dígitos do aplicativo autenticador.')
  return normalized
}

/** O nível AAL é calculado pelo Supabase, e não por uma variável local editável. */
export async function getTotpAssurance() {
  const { data, error } = await requireClient().auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) throw new Error('Não foi possível verificar a segurança da sessão.')
  return { currentLevel: data.currentLevel, nextLevel: data.nextLevel }
}

export async function listVerifiedTotpFactors() {
  const { data, error } = await requireClient().auth.mfa.listFactors()
  if (error || !data) throw new Error('Não foi possível consultar os autenticadores cadastrados.')
  return data.totp.filter((factor) => factor.status === 'verified')
}

/** O QR e o segredo existem apenas na memória do componente de cadastro. */
export async function beginTotpEnrollment() {
  const { data, error } = await requireClient().auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Farol Finanças',
  })
  if (error || !data?.totp) throw new Error('Não foi possível iniciar a autenticação em duas etapas.')
  return {
    factorId: data.id,
    qrSvg: data.totp.qr_code,
    secret: data.totp.secret,
  }
}

/** Em inscrição e login, o desafio precisa ser validado no servidor Supabase. */
export async function verifyTotpCode(factorId: string, code: string): Promise<void> {
  const client = requireClient()
  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId })
  if (challengeError || !challenge) throw new Error('Não foi possível iniciar a verificação do código.')
  const { error } = await client.auth.mfa.verify({
    factorId, challengeId: challenge.id, code: validCode(code),
  })
  if (error) throw new Error('Código inválido ou expirado. Abra o autenticador e tente novamente.')
}

/** Limpeza de cadastro ainda não validado; não remove fatores verificados. */
export async function discardUnverifiedTotpFactor(factorId: string): Promise<void> {
  const { data, error } = await requireClient().auth.mfa.listFactors()
  if (error || !data) return
  const factor = data.all.find((item) => item.id === factorId)
  if (!factor || factor.status === 'verified') return
  await requireClient().auth.mfa.unenroll({ factorId })
}
