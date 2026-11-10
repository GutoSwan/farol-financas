import { mayInitializeAuth } from '../../domain/auth/qaPreviewIsolation'
import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()

/** Não instanciar cliente com placeholders ou chaves secretas. */
export const authConfigured = mayInitializeAuth(
  url, publishableKey, import.meta.env.VITE_FAROL_QA_DEV_ONLY === 'true',
)

/** Backend e dados financeiros continuam locais nesta etapa. */
export const supabase = authConfigured
  ? createClient(url, publishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    })
  : null
