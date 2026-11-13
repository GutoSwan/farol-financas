import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { authConfigured, claimRecoveryCallbackSession, supabase } from '../../infrastructure/auth/supabase'
import { setVerifiedLocalUser } from '../../infrastructure/persistence/legacyAccess'
import { invalidateFinancialUiSession } from './financialUiSession'
import { normalizeDisplayName, normalizeProfileIcon, readProfile } from '../../domain/profile/profile'
import { isFarolAdmin, isFarolSuperAdmin } from '../../domain/auth/adminAccess'
import { parseRecoveryConfirmationLink } from '../../domain/auth/passwordRecovery'
import { safeAuthRedirect } from '../../domain/auth/authRedirect'
import { recoveryEmailRequestError } from '../../domain/auth/recoveryEmailRateLimit'
import { getTotpAssurance, listVerifiedTotpFactors, verifyTotpCode } from '../../infrastructure/auth/totpMfa'
import { clearTrust, trustedSessionExpired } from '../../infrastructure/auth/trustedComputer'
import type { ProfileIcon } from '../../domain/profile/profile'

const session = ref<Session | null>(null)
const ready = ref(!authConfigured)
const recoveringPassword = ref(false)
const passwordJustChanged = ref(false)
const recoveryMfaChecked = ref(false)
const recoveryMfaRequired = ref(false)
const recoveryMfaVerified = ref(false)
const recoveryTotpFactors = ref<Array<{ id: string; label: string }>>([])


/** Revalida mudanças administrativas com o servidor de Auth, não com dados locais. */
async function refreshCurrentUser(): Promise<void> {
  if (!supabase || !session.value) return
  const expectedUserId = session.value.user.id
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data.user && session.value?.user.id === expectedUserId &&
        data.user.id === expectedUserId) {
      session.value = { ...session.value, user: data.user }
    }
  } catch {
    // Se estiver offline, a rota protegida ainda exige validação remota.
  }
}

function startRecoverySession(): void {
  recoveringPassword.value = true
  recoveryMfaChecked.value = false
  recoveryMfaRequired.value = false
  recoveryMfaVerified.value = false
  recoveryTotpFactors.value = []
}

if (supabase) {
  let authRevision = 0
  supabase.auth.onAuthStateChange((event, nextSession) => {
    authRevision++
    session.value = nextSession
    ready.value = true
    if (event === 'PASSWORD_RECOVERY') {
      // O link é confirmado pelo SDK e será revalidado por getUser().
      claimRecoveryCallbackSession(nextSession?.access_token)
      startRecoverySession()
    } else if (claimRecoveryCallbackSession(nextSession?.access_token)) {
      // Fallback seguro: alguns retornos chegam como SIGNED_IN/INITIAL_SESSION.
      // Exigir que o token da URL corresponda à sessão aceita pelo Supabase.
      startRecoverySession()
    }
    if (event === 'SIGNED_OUT') {
      clearTrust()
      // Revogar imediatamente a elegibilidade para dados financeiros locais.
      setVerifiedLocalUser(null)
      invalidateFinancialUiSession()
      recoveringPassword.value = false
      recoveryMfaChecked.value = false
      recoveryMfaRequired.value = false
      recoveryMfaVerified.value = false
      recoveryTotpFactors.value = []
    }
  })
  // Não chamar outras funções Auth dentro do callback de estado.
  // Evitar que uma resposta inicial atrasada restaure sessão antiga após logout.
  const initialRevision = authRevision
  supabase.auth.getSession().then(({ data, error }) => {
    if (!error && authRevision === initialRevision) {
      session.value = data.session
      if (claimRecoveryCallbackSession(data.session?.access_token)) startRecoverySession()
    }
    ready.value = true
    void refreshCurrentUser()
  }).catch(() => { ready.value = true })
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', () => {
      if (trustedSessionExpired()) { void supabase!.auth.signOut({ scope: 'local' }); return }
      void refreshCurrentUser()
    })
  }
}

function client() {
  if (!supabase) throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.local do Vue.')
  return supabase
}

export function useAuth() {
  // Links e convites da Preview usam domínio ESTÁVEL, mesmo quando a pessoa
  // está abrindo uma URL única de deployment da Vercel.
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
    if (error) throw new Error(error.message)
    if (data.session) session.value = data.session
    // Uma nova autenticação normal não herda privilégios de recuperação anteriores.
    recoveringPassword.value = false
    recoveryMfaChecked.value = false
    recoveryMfaRequired.value = false
    recoveryMfaVerified.value = false
    recoveryTotpFactors.value = []
    passwordJustChanged.value = false
    await refreshCurrentUser()
  }

  async function signUp(email: string, password: string, nameInput: string): Promise<boolean> {
    const displayName = normalizeDisplayName(nameInput)
    const { data, error } = await client().auth.signUp({
      email: email.trim(), password,
      options: {
        // Se o template do Supabase oferecer link, ele retorna ao frontend HTTPS
        // que iniciou o cadastro, e não à URL Site padrão de outro ambiente.
        // O endereço precisa estar autorizado em Auth > URL Configuration.
        emailRedirectTo: emailRedirect('/confirmar-email'),
        data: { display_name: displayName, avatar_icon: 'user' },
      },
    })
    // Supabase pode devolver identidades ofuscadas no cadastro duplicado.
    // Evitar consulta de existência de e-mail e mensagens de enumeração.
    if (error) {
      if (/rate limit|too many|over_request/i.test(error.message)) {
        throw new Error('Muitas tentativas de cadastro. Aguarde antes de tentar novamente.')
      }
      throw new Error('Não foi possível concluir o cadastro. Confira o e-mail; se já tiver conta, entre ou recupere a senha.')
    }
    // Sem sessão, o usuário precisa digitar o código do modelo "Confirm signup".
    return !!data.session
  }

  /** Confirma cadastro na mesma tela. Requer {{ .Token }} no modelo Confirm signup. */
  async function verifySignupCode(email: string, rawCode: string): Promise<void> {
    const token = rawCode.replace(/\s/g, '')
    if (!/^\d{6,8}$/.test(token)) {
      throw new Error('Digite o código numérico recebido por e-mail.')
    }
    const { data, error } = await client().auth.verifyOtp({
      email: email.trim(), token, type: 'email',
    })
    if (error) throw new Error('Código inválido ou expirado. Confira o e-mail ou solicite um novo código.')
    if (!data.session) throw new Error('E-mail verificado, mas não foi possível iniciar a sessão. Tente entrar novamente.')
  }

  async function resendSignupCode(email: string): Promise<void> {
    const { error } = await client().auth.resend({
      type: 'signup', email: email.trim(),
      options: { emailRedirectTo: emailRedirect('/confirmar-email') },
    })
    if (error) throw new Error(error.message)
  }

  async function updateProfile(nameInput: string, iconInput: ProfileIcon): Promise<void> {
    if (!session.value) throw new Error('Entre na sua conta para editar o perfil.')
    const displayName = normalizeDisplayName(nameInput)
    const avatarIcon = normalizeProfileIcon(iconInput)
    const { data, error } = await client().auth.updateUser({
      data: { display_name: displayName, avatar_icon: avatarIcon },
    })
    if (error) throw new Error(error.message)
    // A sessão também recebe USER_UPDATED; a atribuição garante atualização imediata.
    if (session.value) session.value = { ...session.value, user: data.user }
  }

  async function requestPasswordReset(email: string): Promise<void> {
    const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: emailRedirect('/redefinir-senha'),
    })
    if (error) throw recoveryEmailRequestError(error)
  }

  /**
   * Alternativa para quando a URL de Preview não consta no allowlist do Auth.
   * A pessoa cola o link recebido diretamente no Farol, sem expor a terceiros.
   */
  async function recoverFromEmailLink(rawLink: string): Promise<void> {
    const hash = parseRecoveryConfirmationLink(
      rawLink, (import.meta.env.VITE_SUPABASE_URL ?? '').trim(),
    )
    if (!hash) throw new Error('Cole o link completo de recuperação recebido no e-mail do Supabase Dev. Não cole links de login ou de outra conta.')
    const { data, error } = await client().auth.verifyOtp({
      token_hash: hash,
      type: 'recovery',
    })
    if (error || !data.session) {
      throw new Error('Este link não pôde ser confirmado. Pode ter expirado ou já ter sido usado. Solicite um novo e-mail.')
    }
    session.value = data.session
    recoveryMfaChecked.value = false
    recoveryMfaVerified.value = false
    recoveryTotpFactors.value = []
    startRecoverySession()
  }

  /** Consulta os fatores cadastrados no servidor após a recuperação por e-mail. */
  async function prepareRecoveryMfa(): Promise<void> {
    recoveryMfaChecked.value = false
    recoveryMfaRequired.value = false
    recoveryMfaVerified.value = false
    recoveryTotpFactors.value = []
    if (!recoveringPassword.value) throw new Error('Confirme primeiro o link recebido por e-mail.')
    const auth = client().auth
    const [{ data: identity, error: identityError }, { data: currentSession, error: sessionError }] =
      await Promise.all([auth.getUser(), auth.getSession()])
    if (identityError || sessionError || !identity.user || !currentSession.session ||
        identity.user.id !== currentSession.session.user.id) {
      throw new Error('A sessão de recuperação expirou. Solicite outro e-mail.')
    }
    const [factors, assurance] = await Promise.all([
      listVerifiedTotpFactors(), getTotpAssurance(),
    ])
    if (isFarolSuperAdmin(identity.user) && factors.length === 0) {
      throw new Error('O Super Admin precisa de um autenticador verificado. Solicite recuperação administrativa se perdeu o segundo fator.')
    }
    recoveryTotpFactors.value = factors.map((factor, index) => ({
      id: factor.id, label: factor.friendly_name || `Autenticador ${index + 1}`,
    }))
    recoveryMfaRequired.value = factors.length > 0
    recoveryMfaVerified.value = assurance.currentLevel === 'aal2' ||
      (factors.length === 0 && assurance.nextLevel === 'aal1')
    recoveryMfaChecked.value = true
  }

  /** Apenas o Supabase consegue elevar a sessão para AAL2 após desafio TOTP. */
  async function verifyRecoveryMfa(factorId: string, code: string): Promise<void> {
    if (!recoveringPassword.value || !recoveryMfaChecked.value ||
        !recoveryMfaRequired.value) throw new Error('Confirme primeiro o link de recuperação.')
    if (!recoveryTotpFactors.value.some((factor) => factor.id === factorId)) {
      throw new Error('Autenticador inválido. Atualize a verificação.')
    }
    await verifyTotpCode(factorId, code)
    const assurance = await getTotpAssurance()
    if (assurance.currentLevel !== 'aal2') {
      throw new Error('O Supabase ainda não confirmou a sessão AAL2. Tente novamente.')
    }
    recoveryMfaVerified.value = true
  }

  async function updatePassword(password: string): Promise<void> {
    const auth = client()
    if (!recoveringPassword.value) {
      throw new Error('Confirme primeiro o link de recuperação enviado ao seu e-mail.')
    }
    const { data, error: sessionError } = await auth.auth.getSession()
    if (sessionError || !data.session) {
      throw new Error('Link inválido ou expirado. Solicite outro e-mail de recuperação.')
    }
    // O próprio servidor deve confirmar o nível AAL2 antes de mudar senha.
    if (!recoveryMfaChecked.value || !recoveryMfaVerified.value) {
      throw new Error('Confirme o código do seu autenticador antes de salvar a nova senha.')
    }
    const [assurance, factors, { data: identity, error: identityError }] = await Promise.all([
      getTotpAssurance(), listVerifiedTotpFactors(), auth.auth.getUser(),
    ])
    if (identityError || !identity.user || identity.user.id !== data.session.user.id ||
        (factors.length > 0 && assurance.currentLevel !== 'aal2') ||
        (isFarolSuperAdmin(identity.user) && factors.length === 0)) {
      throw new Error('Sessão AAL2 obrigatória. Confirme o autenticador para alterar a senha.')
    }
    const { error } = await auth.auth.updateUser({ password })
    if (error) throw new Error(error.message)
    recoveringPassword.value = false
    recoveryMfaChecked.value = false
    recoveryMfaRequired.value = false
    recoveryMfaVerified.value = false
    recoveryTotpFactors.value = []
    passwordJustChanged.value = true
    // Encerrar apenas a sessão temporária de recuperação. Para acessar
    // qualquer tela financeira a pessoa deverá entrar novamente e cumprir 2FA.
    await auth.auth.signOut({ scope: 'local' })
    session.value = null
  }

  /** Alteração em Meu perfil: somente identidade remota validada e TOTP AAL2. */
  async function changePasswordInProfile(password: string): Promise<void> {
    if (password.length < 8) throw new Error('Escolha uma senha com pelo menos 8 caracteres.')
    const auth = client().auth
    const [{ data: current, error: sessionError }, { data: identity, error: identityError },
      factors, assurance] = await Promise.all([
      auth.getSession(), auth.getUser(), listVerifiedTotpFactors(), getTotpAssurance(),
    ])
    if (sessionError || identityError || !current.session || !identity.user ||
        identity.user.id !== current.session.user.id ||
        factors.length === 0 || assurance.currentLevel !== 'aal2') {
      throw new Error('Confirme seu Authenticator para alterar a senha em Meu perfil.')
    }
    const { error } = await auth.updateUser({ password })
    if (error) throw new Error(error.message)
    passwordJustChanged.value = true
    recoveringPassword.value = false
    recoveryMfaChecked.value = false
    recoveryMfaRequired.value = false
    recoveryMfaVerified.value = false
    recoveryTotpFactors.value = []
    // Forçar novo login e MFA após a alteração; não reutilizar sessão de recuperação.
    await auth.signOut({ scope: 'local' })
    session.value = null
  }

  async function signOut(): Promise<void> {
    clearTrust()
    const { error } = await client().auth.signOut()
    if (error) throw new Error(error.message)
    // Não apaga os dados locais do Farol durante a migração.
  }

  /** Testa somente autenticação JWT no backend; não migra nem lista espaços locais. */
  async function checkApiAuth(): Promise<number> {
    const auth = client()
    const { data, error } = await auth.auth.getSession()
    if (error || !data.session) throw new Error('Entre na sua conta antes de verificar a API.')
    let response: Response
    try {
      response = await fetch('/api/v1/workspaces', {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      })
    } catch {
      throw new Error('Não foi possível conectar à API. Confirme que o backend está executando na porta 3333.')
    }
    if (response.status === 401) throw new Error('API recusou a sessão. Confira se SUPABASE_URL é igual no Vue e no backend.')
    if (!response.ok) throw new Error('API indisponível. Confira PostgreSQL, migrações e servidor Fastify.')
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data)) {
      throw new Error('Resposta inesperada da API.')
    }
    return body.data.length
  }

  return {
    configured: authConfigured,
    ready: computed(() => ready.value),
    user: computed(() => session.value?.user ?? null),
    isLoggedIn: computed(() => !!session.value),
    isAdmin: computed(() => isFarolAdmin(session.value?.user)),
    profile: computed(() => readProfile(session.value?.user?.user_metadata as Record<string, unknown> | undefined, session.value?.user?.email)),
    recoveringPassword: computed(() => recoveringPassword.value),
    passwordJustChanged: computed(() => passwordJustChanged.value),
    recoveryMfaChecked: computed(() => recoveryMfaChecked.value),
    recoveryMfaRequired: computed(() => recoveryMfaRequired.value),
    recoveryMfaVerified: computed(() => recoveryMfaVerified.value),
    recoveryTotpFactors: computed(() => recoveryTotpFactors.value),
    prepareRecoveryMfa, verifyRecoveryMfa,
    signIn, signUp, verifySignupCode, resendSignupCode, updateProfile,
    signOut, requestPasswordReset, recoverFromEmailLink, updatePassword, changePasswordInProfile, checkApiAuth,
  }
}
