import type { User } from '@supabase/supabase-js'

/**
 * Papéis administrativos são concedidos pelo Supabase Auth, não pelo perfil
 * editável da pessoa. A rota sempre consulta a identidade remota antes de usar
 * esta informação; a visibilidade do menu não é uma autorização de backend.
 */
export function canAccessAdminOnlyFeature(user: Pick<User, 'app_metadata'> | null | undefined): boolean {
  return user?.app_metadata?.farol_role === 'admin' ||
    user?.app_metadata?.farol_role === 'super_admin'
}
