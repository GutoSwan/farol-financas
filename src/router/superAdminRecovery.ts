/**
 * O Farol financeiro não aceita uma sessão Super Admin para áreas privadas.
 * Exceção estritamente limitada à recuperação por e-mail (rota pública) e
 * ao perfil de troca de senha APÓS confirmação do TOTP pelo Supabase.
 *
 * A autorização AAL2 e o papel são verificados novamente no router e no
 * servidor Supabase antes de alterar a senha. Nunca liberar finanças.
 */
export function allowedSuperAdminRecoveryRoute(
  path: string,
  recoverySession: boolean,
  verifiedTotp: boolean,
): boolean {
  if (path === '/redefinir-senha') return true
  return path === '/conta' && recoverySession && verifiedTotp
}
