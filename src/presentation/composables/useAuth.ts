import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { authConfigured, supabase } from '../../infrastructure/auth/supabase'

const session = ref<Session | null>(null)
const ready = ref(!authConfigured)
const recoveringPassword = ref(false)

if (supabase) {
  supabase.auth.onAuthStateChange((event, nextSession) => {
    session.value = nextSession
    ready.value = true
    if (event === 'PASSWORD_RECOVERY') recoveringPassword.value = true
    if (event === 'SIGNED_OUT') recoveringPassword.value = false
  })
  // Não chamar nenhuma outra função assíncrona de Auth dentro do callback.
  supabase.auth.getSession().then(({ data, error }) => {
    if (!error) session.value = data.session
    ready.value = true
  }).catch(() => { ready.value = true })
}

function client() {
  if (!supabase) throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.local do Vue.')
  return supabase
}

export function useAuth() {
  async function signIn(email: string, password: string): Promise<void> {
    const { error } = await client().auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error(error.message)
  }

  async function signUp(email: string, password: string): Promise<boolean> {
    const { data, error } = await client().auth.signUp({
      email: email.trim(), password,
      options: { emailRedirectTo: `${window.location.origin}/entrar` },
    })
    if (error) throw new Error(error.message)
    // Confirmação de e-mail costuma resultar em session=null.
    return !!data.session
  }

  async function requestPasswordReset(email: string): Promise<void> {
    const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    if (error) throw new Error(error.message)
  }

  async function updatePassword(password: string): Promise<void> {
    const auth = client()
    const { data } = await auth.auth.getSession()
    if (!data.session) throw new Error('Link inválido ou expirado. Solicite outro e-mail de recuperação.')
    const { error } = await auth.auth.updateUser({ password })
    if (error) throw new Error(error.message)
    recoveringPassword.value = false
  }

  async function signOut(): Promise<void> {
    const { error } = await client().auth.signOut()
    if (error) throw new Error(error.message)
    // Não apaga dados do localStorage do Farol durante a migração.
  }

  /** Testa somente a autenticação no backend. NÃO migra nem lista os espaços locais. */
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
    recoveringPassword: computed(() => recoveringPassword.value),
    signIn, signUp, signOut, requestPasswordReset, updatePassword, checkApiAuth,
  }
}
