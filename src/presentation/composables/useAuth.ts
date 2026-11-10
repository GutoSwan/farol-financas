import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { authConfigured, supabase } from '../../infrastructure/auth/supabase'
import { normalizeDisplayName, normalizeProfileIcon, readProfile } from '../../domain/profile/profile'
import { isFarolAdmin, isFarolSuperAdmin } from '../../domain/auth/adminAccess'
import { parseRecoveryConfirmationLink } from '../../domain/auth/passwordRecovery'
import type { ProfileIcon } from '../../domain/profile/profile'

const session = ref<Session | null>(null)
const ready = ref(!authConfigured)
const recoveringPassword = ref(false)


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

if (supabase) {
  supabase.auth.onAuthStateChange((event, nextSession) => {
    session.value = nextSession
    ready.value = true
    if (event === 'PASSWORD_RECOVERY') recoveringPassword.value = true
    if (event === 'SIGNED_OUT') recoveringPassword.value = false
  })
  // Não chamar outras funções Auth dentro do callback de estado.
  supabase.auth.getSession().then(({ data, error }) => {
    if (!error) session.value = data.session
    ready.value = true
    void refreshCurrentUser()
  }).catch(() => { ready.value = true })
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', () => { void refreshCurrentUser() })
  }
}

function client() {
  if (!supabase) throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.local do Vue.')
  return supabase
}

export function useAuth() {
  async function signIn(email: string, password: string): Promise<void> {
    const { data, error } = await client().auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error(error.message)
    if (data.session) session.value = data.session
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
        emailRedirectTo: `${window.location.origin}/entrar`,
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
      options: { emailRedirectTo: `${window.location.origin}/entrar` },
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
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    if (error) throw new Error(error.message)
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
    recoveringPassword.value = true
    session.value = data.session
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
    const { error } = await auth.auth.updateUser({ password })
    if (error) throw new Error(error.message)
    recoveringPassword.value = false
    // Encerrar apenas a sessão temporária de recuperação. Para acessar
    // qualquer tela financeira a pessoa deverá entrar novamente e cumprir 2FA.
    await auth.auth.signOut({ scope: 'local' })
    session.value = null
  }

  async function signOut(): Promise<void> {
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
    isSuperAdmin: computed(() => isFarolSuperAdmin(session.value?.user)),
    profile: computed(() => readProfile(session.value?.user?.user_metadata as Record<string, unknown> | undefined, session.value?.user?.email)),
    recoveringPassword: computed(() => recoveringPassword.value),
    signIn, signUp, verifySignupCode, resendSignupCode, updateProfile,
    signOut, requestPasswordReset, recoverFromEmailLink, updatePassword, checkApiAuth,
  }
}
