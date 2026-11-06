/**
 * Permissão GLOBAL do Farol, distinta dos papéis OWNER/EDITOR/VIEWER dos espaços.
 * Somente app_metadata, atribuído por processo administrativo confiável no Supabase.
 * user_metadata/display_name/email são modificáveis pelo usuário e NÃO concedem acesso.
 */
export interface FarolAdminIdentity {
  app_metadata?: Record<string, unknown> | null
}
export function isFarolAdmin(user: FarolAdminIdentity | null | undefined): boolean {
  return user?.app_metadata?.farol_role === 'administrador'
}
