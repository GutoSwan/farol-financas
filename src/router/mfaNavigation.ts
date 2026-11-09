/**
 * Só um login de senha (AAL1) não autoriza dados financeiros nem redefinição de MFA.
 * O Supabase é a fonte de verdade para os fatores VERIFICADOS.
 *
 * - 0 fatores verificados: permitir inscrição de um NOVO TOTP em tela isolada.
 * - >=1 fator: desafiar fator existente; jamais cadastrar substituto após senha.
 * - fator desconhecido (falha na API): negar acesso financeiro (fail closed).
 */
export function requiredMfaRedirect(
  path: string,
  requiresFinancialData: boolean,
  currentLevel: string | null,
  nextLevel: string | null,
  verifiedFactors: number | null = null,
): '/configurar-2fa' | '/verificar-2fa' | '/' | null {
  if (verifiedFactors === null) {
    if (path === '/configurar-2fa' || path === '/verificar-2fa') return null
    if (requiresFinancialData || path === '/conta') return '/verificar-2fa'
    return null
  }
  if (verifiedFactors === 0) {
    if (path === '/configurar-2fa') return null
    if (requiresFinancialData || path === '/conta' || path === '/verificar-2fa') {
      return '/configurar-2fa'
    }
    return null
  }
  // Quem ainda tem TOTP no Supabase precisa provar posse do fator antigo.
  if (currentLevel !== 'aal2') {
    return path === '/verificar-2fa' ? null : '/verificar-2fa'
  }
  if (path === '/configurar-2fa' || path === '/verificar-2fa') return '/'
  return null
}
