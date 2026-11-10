import { supabase } from './supabase'
import { apiEndpoint } from '../api/apiEndpoint'

/**
 * A app_metadata da tela é apenas indicação visual. A API usa o JWT validado,
 * checa sessão ativa, MFA AAL2 e lê o papel ATUAL em auth.users.
 * Qualquer falha de rede mantém o painel fechado.
 */
export async function verifySuperAdminAccess(): Promise<boolean> {
  if (!supabase) return false
  try {
    const { data: user, error } = await supabase.auth.getUser()
    if (error || !user.user) return false
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalError || aal?.currentLevel !== 'aal2') return false
    const { data: session, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session.session || session.session.user.id !== user.user.id) return false
    const response = await fetch(apiEndpoint('/api/v1/admin/access'), {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + session.session.access_token },
      cache: 'no-store',
    })
    if (!response.ok) return false
    const result: unknown = await response.json()
    return typeof result === 'object' && result !== null &&
      'data' in result && typeof result.data === 'object' &&
      result.data !== null && 'superAdmin' in result.data &&
      result.data.superAdmin === true
  } catch {
    return false
  }
}
