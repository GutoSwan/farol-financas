/**
 * O login e o cadastro são telas para visitantes. Não redirecionar recuperação
 * de senha nem a página de perfil, mesmo que o Supabase possua uma sessão.
 * Esta regra NÃO protege dados financeiros ainda mantidos em localStorage.
 */
export function shouldRedirectLoggedInVisitor(path: string, authenticated: boolean): boolean {
  return authenticated && (path === '/entrar' || path === '/cadastro')
}
