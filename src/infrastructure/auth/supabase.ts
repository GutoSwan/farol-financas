import { mayInitializeAuth } from '../../domain/auth/qaPreviewIsolation'
import { createClient } from '@supabase/supabase-js'
import { recoveryAccessTokenFromFragment } from '../../domain/auth/recoveryCallback'

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()

/** Não instanciar cliente com placeholders ou chaves secretas. */
export const authConfigured = mayInitializeAuth(
  url, publishableKey, import.meta.env.VITE_FAROL_QA_DEV_ONLY === 'true',
)

// Capturar antes de createClient: o SDK processa e limpa os tokens do hash.
let recoveryRedirectAccessToken = typeof window === 'undefined'
  ? null
  : recoveryAccessTokenFromFragment(window.location.pathname, window.location.hash)

export function claimRecoveryCallbackSession(accessToken: string | null | undefined): boolean {
  if (!accessToken || !recoveryRedirectAccessToken || accessToken !== recoveryRedirectAccessToken) return false
  recoveryRedirectAccessToken = null
  return true
}

/** Backend e dados financeiros continuam locais nesta etapa. */
export const supabase = authConfigured
  ? createClient(url, publishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    })
  : null
