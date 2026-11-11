// Branch fixa de QA: links por e-mail não podem apontar para previews antigos.
const PREVIEW_DEV_AUTH_ORIGIN =
  'https://farol-financas-git-feat-v029-admin-standalone-preview-farol13.vercel.app'

/**
 * Recuperação por e-mail precisa retornar sempre a um endereço estável.
 * URLs únicas da Vercel mudam a cada build e frequentemente não constam no
 * allowlist do Supabase Auth.
 */
export function safeAuthRedirect(
  pathname: '/confirmar-email' | '/entrar' | '/redefinir-senha',
  currentOrigin: string,
  configuredOrigin: string,
  qaDevOnly: boolean,
): string {
  const selected = configuredOrigin.trim() || currentOrigin
  const u = new URL(selected)
  if (u.protocol !== 'https:' ||
      (u.href !== u.origin + '/' && u.href !== u.origin) ||
      u.username || u.password || u.search || u.hash ||
      (qaDevOnly && u.origin !== PREVIEW_DEV_AUTH_ORIGIN)) {
    throw new Error('A URL de retorno do Auth Dev não está configurada com segurança.')
  }
  return u.origin + pathname
}
