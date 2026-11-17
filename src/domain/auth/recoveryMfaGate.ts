export type RecoveryMfaStatus = 'checking' | 'required' | 'ready' | 'error'

/** O Supabase só permite atualizar a senha com AAL2 quando existe MFA ativo. */
export function recoveryMfaDecision(levels: {
  currentLevel: string | null
  nextLevel: string | null
}): 'required' | 'ready' {
  if (levels.currentLevel === 'aal2') return 'ready'
  if (levels.currentLevel === 'aal1' && levels.nextLevel === 'aal2') return 'required'
  if (levels.currentLevel === 'aal1' && levels.nextLevel === 'aal1') return 'ready'
  throw new Error('Não foi possível verificar a segurança da sessão. Abra novamente o link de recuperação.')
}
