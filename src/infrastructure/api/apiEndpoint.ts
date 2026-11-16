/**
 * A URL da API é pública, mas nunca deve incluir credenciais.
 * Em produção, só aceitamos um endpoint HTTPS absoluto.
 * No Vite local o proxy /api continua funcionando sem configurar esta variável.
 */
export function resolveApiBaseUrl(raw: string, isDev: boolean, devQaPreview = false): string | null {
  const value = raw.trim()
  // Preview QA usa a Function na mesma origem; produção não recebe esse atalho.
  if (!value) return isDev || devQaPreview ? '' : null
  try {
    const url = new URL(value)
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(isDev && url.protocol === 'http:'))) return null
    return url.origin
  } catch { return null }
}

export const apiBaseUrl = resolveApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL ?? '',
  import.meta.env.DEV,
  import.meta.env.VITE_FAROL_QA_DEV_ONLY === 'true',
)
export const apiConfigured = apiBaseUrl !== null

export function apiEndpoint(path: string): string {
  if (apiBaseUrl === null) throw new Error('A API online ainda não foi configurada. Volte quando o backend estiver publicado.')
  if (!path.startsWith('/api/v1/')) throw new Error('Rota da API não reconhecida.')
  return `${apiBaseUrl}${path}`
}
