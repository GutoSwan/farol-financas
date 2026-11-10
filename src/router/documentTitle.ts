/** Nomes de aba. O modo Super Admin é visível até com várias abas abertas. */
const NORMAL_TITLES: Record<string, string> = {
  '/entrar': 'Entrar',
  '/cadastro': 'Criar conta',
  '/recuperar-senha': 'Recuperar senha',
  '/redefinir-senha': 'Definir nova senha',
}
export function routeDocumentTitle(path: string, title = ''): string {
  if (path === '/administracao') return 'Farol Finanças • SUPER ADMIN | Painel'
  if (path.startsWith('/administracao/')) {
    const section = title || 'Ferramentas administrativas'
    return `Farol Finanças • SUPER ADMIN | ${section}`
  }
  const section = NORMAL_TITLES[path] || title || 'Visão geral'
  return `Farol Finanças • ${section}`
}
