/** Títulos exclusivos do Farol financeiro; o console técnico tem build próprio. */
const NORMAL_TITLES: Record<string, string> = {
  '/entrar': 'Entrar',
  '/cadastro': 'Criar conta',
  '/recuperar-senha': 'Recuperar senha',
  '/redefinir-senha': 'Definir nova senha',
}
export function routeDocumentTitle(path: string, title = ''): string {
  const section = NORMAL_TITLES[path] || title || 'Visão geral'
  return `Farol Finanças • ${section}`
}
