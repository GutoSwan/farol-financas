/** Aceita somente um link de RECUPERAÇÃO emitido pelo Supabase Auth desta instância.
 * O token de uso único não deve ser registrado, salvo ou enviado a terceiros.
 */
export function parseRecoveryConfirmationLink(link: string, projectUrl: string): string | null {
  if (!link || link.length > 4096) return null
  try {
    const endpoint = new URL(projectUrl)
    const url = new URL(link.trim())
    if (url.protocol !== 'https:' || endpoint.protocol !== 'https:' ||
        url.origin !== endpoint.origin ||
        url.pathname !== '/auth/v1/verify' ||
        url.username || url.password ||
        url.searchParams.get('type') !== 'recovery') return null
    const hashes = url.searchParams.getAll('token')
    if (hashes.length !== 1 || !/^[a-fA-F0-9]{64}$/.test(hashes[0])) return null
    return hashes[0]
  } catch {
    return null
  }
}
