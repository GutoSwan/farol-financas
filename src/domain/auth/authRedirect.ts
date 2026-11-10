const PREVIEW_DEV_AUTH_ORIGIN =
  'https://farol-financas-git-security-v027-auth-only-admin-8d8d01-farol13.vercel.app'

/**
 * Recuperação por e-mail precisa retornar sempre a um endereço estável.
 * URLs únicas da Vercel mudam a cada build e frequentemente não constam no
 * allowlist do Supabase Auth.
 */
export function safeAuthRedirect(
  pathname: '/entrar' | '/redefinir-senha',
  currentOrigin: string,
  configuredOrigin: string,
  qaDevOnly: boolean,
): string {
  const selected = configuredOrigin.trim() || currentOrigin
  const u = new URL(selected)
  if (u.protocol !== 'https:' ||
      u.href !== u.origin + '/' && u.href !== u.origin ||
      u.username || u.password ||
      (qaDevOnly && u.origin !== PREVIEW_DEV_AUTH_ORIGIN)) {
    throw new Error('A URL de retorno do Auth Dev não está configurada com segurança.')
  }
  return u.origin + pathname
}
