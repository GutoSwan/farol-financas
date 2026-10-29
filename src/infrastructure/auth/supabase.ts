import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()

/** Não instanciar cliente com placeholders ou chaves secretas. */
export const authConfigured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) &&
  publishableKey.startsWith('sb_publishable_') &&
  !publishableKey.includes('SUBSTITUA')

/** Backend e dados financeiros continuam locais nesta etapa. */
export const supabase = authConfigured
  ? createClient(url, publishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    })
  : null
