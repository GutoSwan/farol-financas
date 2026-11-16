/** Apenas login, confirmação e recuperação de senha são públicos. */
const PUBLIC_AUTH_ROUTES = new Set([
  '/entrar',
  '/confirmar-email',
  '/recuperar-senha',
  '/redefinir-senha',
])

export function canAccessWithoutSession(path: string): boolean {
  return PUBLIC_AUTH_ROUTES.has(path)
}

export function shouldRedirectLoggedInVisitor(path: string, authenticated: boolean): boolean {
  return authenticated && path === '/entrar'
}
