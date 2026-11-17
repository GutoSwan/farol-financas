export type LoginMfaStatus = 'checking' | 'required' | 'ready' | 'error'

/** A sessão de senha só pode abrir finanças após avaliar o AAL do Supabase. */
export function loginMfaStatus(currentLevel: string | null, nextLevel: string | null): LoginMfaStatus {
  if (currentLevel === 'aal2') return 'ready'
  if (currentLevel === 'aal1' && nextLevel === 'aal1') return 'ready'
  if (currentLevel === 'aal1' && nextLevel === 'aal2') return 'required'
  return 'error'
}
