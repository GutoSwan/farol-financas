import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { authConfigured, claimRecoveryCallbackSession, supabase } from '../../infrastructure/auth/supabase'
import { setVerifiedLocalUser } from '../../infrastructure/persistence/legacyAccess'
import { invalidateFinancialUiSession } from './financialUiSession'
import { normalizeDisplayName, normalizeProfileIcon, readProfile } from '../../domain/profile/profile'
import { parseRecoveryConfirmationLink } from '../../domain/auth/passwordRecovery'
import { safeAuthRedirect } from '../../domain/auth/authRedirect'
import { recoveryEmailRequestError } from '../../domain/auth/recoveryEmailRateLimit'
import { assertPasswordNotLeaked } from '../../domain/auth/passwordSafety'
import { loginMfaStatus, type LoginMfaStatus } from '../../domain/auth/loginMfaGate'
import { recoveryMfaDecision, type RecoveryMfaStatus } from '../../domain/auth/recoveryMfaGate'
import type { ProfileIcon } from '../../domain/profile/profile'

const session = ref<Session | null>(null)
const ready = ref(!authConfigured)
const recoveringPassword = ref(false)
const recoveryMfaStatus = ref<RecoveryMfaStatus>('checking')
const passwordJustChanged = ref(false)
const mfaStatus = ref<LoginMfaStatus>('checking')
let mfaRevision = 0
let checkedMfaToken: string | null = null

async function refreshLoginMfa(force = false): Promise<LoginMfaStatus> {
  const expectedSession = session.value?.access_token
  if (!supabase || !expectedSession) {
    checkedMfaToken = null
    mfaStatus.value = 'checking'
    return 'checking'
  }
  // Não desmontar telas nem descartar formulários em toda navegação: verificar
  // novamente quando o JWT mudar (login, MFA ou refresh), nunca reutilizar outro token.
  if (!force && checkedMfaToken === expectedSession && mfaStatus.value !== 'checking') {
    return mfaStatus.value
  }
  const revision = ++mfaRevision
  mfaStatus.value = 'checking'
  let next: LoginMfaStatus = 'error'
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (!error && data) next = loginMfaStatus(data.currentLevel, data.nextLevel)
  } catch { /* Não liberar conteúdo financeiro se falhar a verificação. */ }
  if (revision === mfaRevision && session.value?.access_token === expectedSession) {
    mfaStatus.value = next
    checkedMfaToken = expectedSession
  }
  return next
}

async function refreshCurrentUser(): Promise<void> {
  if (!supabase || !session.value) return
  const expected = session.value.user.id
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data.user?.id === expected && session.value?.user.id === expected) {
      session.value = { ...session.value, user: data.user }
    }
  } catch {
    // Rotas privadas fazem sua própria verificação remota.
  }
}

if (supabase) {
  let revision = 0
  supabase.auth.onAuthStateChange((event, nextSession) => {
    revision++
    const tokenChanged = session.value?.access_token !== nextSession?.access_token
    session.value = nextSession
    ready.value = true
    if (tokenChanged) {
      checkedMfaToken = null
      mfaStatus.value = 'checking'
      ++mfaRevision
    }
    if (event === 'PASSWORD_RECOVERY' || claimRecoveryCallbackSession(nextSession?.access_token)) {
      recoveringPassword.value = true
      recoveryMfaStatus.value = 'checking'
    }
    if (event === 'SIGNED_OUT') {
      recoveringPassword.value = false
      recoveryMfaStatus.value = 'checking'
      setVerifiedLocalUser(null)
      invalidateFinancialUiSession()
    }
    // Nunca chamar outra função Auth diretamente dentro do callback do SDK.
    if (nextSession && tokenChanged) void Promise.resolve().then(() => refreshLoginMfa())
  })
  const initialRevision = revision
  supabase.auth.getSession().then(({ data, error }) => {
    if (!error && revision === initialRevision) {
      session.value = data.session
      if (claimRecoveryCallbackSession(data.session?.access_token)) recoveringPassword.value = true
      if (data.session) void refreshLoginMfa()
    }
    ready.value = true
    void refreshCurrentUser()
  }).catch(() => { ready.value = true })
}

function client() {
  if (!supabase) throw new Error('A conexão com o Supabase não está configurada.')
  return supabase
}

export function useAuth() {
  function emailRedirect(pathname: '/confirmar-email' | '/redefinir-senha'): string {
    return safeAuthRedirect(
      pathname,
      window.location.origin,
      import.meta.env.VITE_AUTH_REDIRECT_BASE_URL ?? '',
      import.meta.env.VITE_FAROL_QA_DEV_ONLY === 'true',
    )
  }

  async function signIn(email: string, password: string): Promise<void> {
    const { data, error } = await client().auth.signInWithPassword({ email: email.trim(), password })
    if (error || !data.session) throw new Error(error?.message ?? 'Não foi possível iniciar a sessão.')
    session.value = data.session
    recoveringPassword.value = false
    recoveryMfaStatus.value = 'checking'
    passwordJustChanged.value = false
    await refreshCurrentUser()
    const mfa = await refreshLoginMfa()
    if (mfa === 'error') throw new Error('Não foi possível verificar a segurança da sessão. Tente novamente.')
  }

  async function verifyLoginAuthenticator(code: string): Promise<void> {
    if (!/^\d{6}$/.test(code)) throw new Error('Informe os seis números do autenticador.')
    if (!session.value || recoveringPassword.value) throw new Error('Entre novamente para confirmar seu acesso.')
    const auth = client().auth
    const { data: factors, error: factorError } = await auth.mfa.listFactors()
    if (factorError) throw new Error('Não foi possível consultar seu autenticador. Tente novamente.')
    const factor = factors?.totp.find(item => item.status === 'verified')
    if (!factor) throw new Error('Não foi encontrado um autenticador ativo. Recupere o acesso à conta.')
    const { error } = await auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    if (error) throw new Error('Código inválido ou expirado. Confira o autenticador e tente novamente.')
    if (await refreshLoginMfa() !== 'ready') {
      throw new Error('A verificação ainda não foi confirmada. Tente novamente.')
    }
  }

  async function updateProfile(nameInput: string, iconInput: ProfileIcon): Promise<void> {
    if (!session.value) throw new Error('Entre para editar o perfil.')
    const displayName = normalizeDisplayName(nameInput)
    const avatarIcon = normalizeProfileIcon(iconInput)
    const { data, error } = await client().auth.updateUser({
      data: { display_name: displayName, avatar_icon: avatarIcon },
    })
    if (error) throw new Error(error.message)
    if (session.value) session.value = { ...session.value, user: data.user }
  }

  async function requestPasswordReset(email: string): Promise<void> {
    const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: emailRedirect('/redefinir-senha'),
    })
    if (error) throw recoveryEmailRequestError(error)
  }

  async function recoverFromEmailLink(rawLink: string): Promise<void> {
    const hash = parseRecoveryConfirmationLink(
      rawLink, (import.meta.env.VITE_SUPABASE_URL ?? '').trim(),
    )
    if (!hash) throw new Error('Cole somente o link completo de recuperação recebido no seu e-mail.')
    const { data, error } = await client().auth.verifyOtp({ token_hash: hash, type: 'recovery' })
    if (error || !data.session) throw new Error('O link expirou ou já foi utilizado. Solicite outro e-mail.')
    session.value = data.session
    recoveringPassword.value = true
    recoveryMfaStatus.value = 'checking'
  }

  async function inspectRecoveryMfa(): Promise<'required' | 'ready'> {
    if (!recoveringPassword.value) throw new Error('Confirme primeiro seu link de recuperação.')
    recoveryMfaStatus.value = 'checking'
    try {
      const auth = client().auth
      const { data: identity, error: identityError } = await auth.getUser()
      if (identityError || !identity.user || !recoveringPassword.value) {
        throw new Error('Sua sessão de recuperação expirou. Solicite outro link.')
      }
      const { data: levels, error: levelError } = await auth.mfa.getAuthenticatorAssuranceLevel()
      if (levelError || !levels) throw new Error('Não foi possível consultar o autenticador. Tente novamente.')
      const decision = recoveryMfaDecision(levels)
      if (decision === 'required') {
        const { data: factors, error: factorError } = await auth.mfa.listFactors()
        if (factorError || !factors) throw new Error('Não foi possível consultar o autenticador. Tente novamente.')
        if (!factors.totp.some(factor => factor.status === 'verified')) {
          throw new Error('Esta conta exige autenticação adicional, mas não há um autenticador TOTP disponível. Não é possível ignorar a proteção de duas etapas.')
        }
      }
      if (recoveringPassword.value) recoveryMfaStatus.value = decision
      return decision
    } catch (error) {
      recoveryMfaStatus.value = 'error'
      throw error
    }
  }

  async function verifyRecoveryAuthenticator(code: string): Promise<void> {
    if (!recoveringPassword.value || recoveryMfaStatus.value !== 'required') {
      throw new Error('Confirme primeiro seu link de recuperação.')
    }
    if (!/^\d{6}$/.test(code.trim())) throw new Error('Digite os 6 números do autenticador.')
    const auth = client().auth
    const { data: factors, error: factorError } = await auth.mfa.listFactors()
    if (factorError || !factors) throw new Error('Não foi possível consultar o autenticador. Tente novamente.')
    const factor = factors.totp.find(item => item.status === 'verified')
    if (!factor) throw new Error('Nenhum autenticador ativo foi encontrado nesta conta.')
    const { error } = await auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() })
    if (error) throw new Error('Código inválido ou expirado. Confira o aplicativo autenticador e tente novamente.')
    if (await inspectRecoveryMfa() !== 'ready') {
      throw new Error('Não foi possível confirmar a segunda etapa. Tente novamente.')
    }
  }

  async function updatePassword(password: string): Promise<void> {
    if (!recoveringPassword.value) {
      throw new Error('Confirme primeiro o link de recuperação enviado ao seu e-mail.')
    }
    const auth = client().auth
    const [{ data: active, error: sessionError }, { data: identity, error: identityError }] =
      await Promise.all([auth.getSession(), auth.getUser()])
    if (sessionError || identityError || !active.session || !identity.user ||
        active.session.user.id !== identity.user.id) {
      throw new Error('Sessão de recuperação inválida. Solicite um novo link.')
    }
    const { data: levels, error: levelError } = await auth.mfa.getAuthenticatorAssuranceLevel()
    if (levelError || !levels) throw new Error('Não foi possível verificar a segurança da sessão.')
    if (recoveryMfaDecision(levels) === 'required') {
      recoveryMfaStatus.value = 'required'
      throw new Error('Confirme o código do autenticador antes de alterar a senha.')
    }
    await assertPasswordNotLeaked(password)
    const { error } = await auth.updateUser({ password })
    if (error) throw new Error(error.message)
    passwordJustChanged.value = true
    recoveringPassword.value = false
    recoveryMfaStatus.value = 'checking'
    // Não utilizar a sessão temporária de recuperação para abrir dados financeiros.
    await auth.signOut({ scope: 'local' })
    session.value = null
  }

  async function signOut(): Promise<void> {
    const { error } = await client().auth.signOut()
    if (error) throw new Error(error.message)
  }

  return {
    configured: authConfigured,
    ready: computed(() => ready.value),
    user: computed(() => session.value?.user ?? null),
    isLoggedIn: computed(() => !!session.value),
    profile: computed(() => readProfile(
      session.value?.user?.user_metadata as Record<string, unknown> | undefined,
      session.value?.user?.email,
    )),
    recoveringPassword: computed(() => recoveringPassword.value),
    recoveryMfaStatus: computed(() => recoveryMfaStatus.value),
    passwordJustChanged: computed(() => passwordJustChanged.value),
    mfaStatus: computed(() => mfaStatus.value),
    refreshLoginMfa, verifyLoginAuthenticator,
    signIn, updateProfile, signOut, requestPasswordReset, recoverFromEmailLink,
    inspectRecoveryMfa, verifyRecoveryAuthenticator, updatePassword,
  }
}
