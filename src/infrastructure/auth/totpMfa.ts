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
export async function beginTotpEnrollment(displayName = '') {
  const sanitized = displayName.trim().replace(/\s+/g, ' ').slice(0, 40)
  const { data, error } = await requireClient().auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: sanitized || 'Farol Finanças',
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
  // Rejeitar entradas inválidas antes de criar um challenge no Supabase.
  // Evita requisições desnecessárias e consumo de limites de tentativas.
  const normalized = validCode(code)
  if (!/^[0-9a-f-]{36}$/i.test(factorId)) throw new Error('Autenticador inválido. Atualize a lista.')
  const client = requireClient()
  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId })
  if (challengeError || !challenge) throw new Error('Não foi possível iniciar a verificação do código.')
  const { error } = await client.auth.mfa.verify({
    factorId, challengeId: challenge.id, code: normalized,
  })
  if (error) throw new Error('Código inválido ou expirado. Abra o autenticador e tente novamente.')
}

/**
 * Exclui SOMENTE fator verificado pertencente à conta atual, após nova
 * confirmação remota de AAL2. A API do Supabase também exige AAL2.
 * Nunca usar credenciais administrativas nem confiar em campos do navegador.
 */
export async function removeVerifiedTotpFactor(factorId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(factorId)) throw new Error('Autenticador inválido. Atualize a lista.')
  const auth = requireClient().auth
  const [{ data: identity, error: identityError }, { data: aal, error: aalError }] = await Promise.all([
    auth.getUser(),
    auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (identityError || !identity.user) throw new Error('Entre novamente antes de alterar os autenticadores.')
  if (aalError || aal?.currentLevel !== 'aal2') {
    throw new Error('Confirme seu segundo fator antes de remover ou substituir um autenticador.')
  }
  const factors = await listVerifiedTotpFactors()
  if (!factors.some((factor) => factor.id === factorId)) {
    throw new Error('Este autenticador não está mais vinculado à sua conta. Atualize a lista.')
  }
  const { error } = await auth.mfa.unenroll({ factorId })
  if (error) throw new Error('Não foi possível remover o autenticador no Supabase. Tente novamente.')
}

/**
 * Cancelar inscrição só conclui quando o Supabase confirma a retirada.
 * Uma falha de rede NÃO deve esconder o QR/segredo e afirmar cancelamento.
 * Um fator já verificado nunca pode ser excluído por este fluxo de AAL1.
 */
export async function discardUnverifiedTotpFactor(factorId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(factorId)) {
    throw new Error('Identificador inválido. Atualize a página antes de cancelar.')
  }
  const client = requireClient()
  const { data, error } = await client.auth.mfa.listFactors()
  if (error || !data) {
    throw new Error('Não foi possível consultar o fator para cancelar. Verifique a conexão.')
  }
  const factor = data.all.find((item) => item.id === factorId)
  if (!factor) return // Já removido no Supabase.
  if (factor.status === 'verified') {
    throw new Error('Este autenticador já foi confirmado. Use a remoção protegida por 2FA.')
  }
  const { error: unenrollError } = await client.auth.mfa.unenroll({ factorId })
  if (unenrollError) {
    throw new Error('O Supabase não confirmou o cancelamento. Tente novamente.')
  }
}
