/**
 * Uma sessão Super Admin de login NORMAL pode acessar o Farol financeiro como
 * qualquer usuário, mantendo MFA, vínculo local e isolamento pelo backend.
 *
 * Já durante a RECUPERAÇÃO de senha por e-mail, o acesso é restrito à rota
 * pública de redefinição e ao perfil APÓS confirmação TOTP no Supabase.
 * Essa sessão temporária não deve liberar nenhuma tela financeira.
 */
export function allowedSuperAdminRecoveryRoute(
  path: string,
  recoverySession: boolean,
  verifiedTotp: boolean,
): boolean {
  if (path === '/redefinir-senha') return true
  return path === '/conta' && recoverySession && verifiedTotp
}
