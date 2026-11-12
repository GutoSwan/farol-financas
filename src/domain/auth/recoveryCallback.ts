/**
 * O SDK Supabase remove o fragmento #access_token da URL durante a inicialização.
 * Capturamos SOMENTE a identificação do callback antes disso, na memória.
 * A prova de recuperação exige o mesmo access_token de uma sessão recebida
 * do SDK e, antes de qualquer alteração, getUser() + fatores do Supabase.
 */
export function recoveryAccessTokenFromFragment(path: string, fragment: string): string | null {
  if (path !== '/redefinir-senha' || !fragment.startsWith('#')) return null
  const params = new URLSearchParams(fragment.slice(1))
  const accessTokens = params.getAll('access_token')
  if (params.get('type') !== 'recovery' || accessTokens.length !== 1) return null
  const token = accessTokens[0]
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null
  return token
}
