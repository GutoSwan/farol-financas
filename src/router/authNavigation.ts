/**
 * Rotas de autenticação públicas: visitantes precisam conseguir entrar,
 * criar conta e recuperar a senha mesmo sem uma sessão restaurada.
 */
const PUBLIC_AUTH_ROUTES = new Set([
  '/entrar',
  '/cadastro',
  '/recuperar-senha',
  '/redefinir-senha',
])

/** Todo o restante do Farol, inclusive '/' e '/conta', exige login. */
export function canAccessWithoutSession(path: string): boolean {
  return PUBLIC_AUTH_ROUTES.has(path)
}

/** Usuários com sessão ativa começam na Visão geral, não no login/cadastro. */
export function shouldRedirectLoggedInVisitor(path: string, authenticated: boolean): boolean {
  return authenticated && (path === '/entrar' || path === '/cadastro')
}
