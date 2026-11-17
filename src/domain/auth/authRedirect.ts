// Apenas endereços fixos e revisados de QA Dev podem receber links por e-mail.
const PREVIEW_DEV_AUTH_ORIGINS = new Set([
  'https://farol-financas-git-feat-v029-admin-standalone-preview-farol13.vercel.app',
  'https://farol-financas-git-feat-password-safety-free-20261117-farol13.vercel.app',
])

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
      (qaDevOnly && !PREVIEW_DEV_AUTH_ORIGINS.has(u.origin))) {
    throw new Error('A URL de retorno do Auth Dev não está configurada com segurança.')
  }
  return u.origin + pathname
}
