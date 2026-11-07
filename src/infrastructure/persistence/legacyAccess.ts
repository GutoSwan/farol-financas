/**
 * Barreira provisória de privacidade para dados antigos em localStorage.
 * Não é segurança criptográfica: scripts no mesmo origin e acesso físico ao perfil
 * do navegador ainda conseguem ler os valores não cifrados.
 * A fonte de verdade da identidade é SEMPRE o Supabase Auth, validado no router.
 */
const OWNER_KEY = 'farol-financas:legacy-local-owner:v1'
let verifiedUserId: string | null = null

export type LegacyAccess = 'unclaimed' | 'allowed' | 'different-user' | 'unavailable'

export function setVerifiedLocalUser(userId: string | null): void {
  verifiedUserId = userId && /^[0-9a-f-]{36}$/i.test(userId) ? userId : null
}

export function localLegacyAccess(userId: string): LegacyAccess {
  if (!verifiedUserId || userId !== verifiedUserId) return 'different-user'
  try {
    const owner = localStorage.getItem(OWNER_KEY)
    if (owner === null) return 'unclaimed'
    return owner === userId ? 'allowed' : 'different-user'
  } catch { return 'unavailable' }
}

/**
 * Somente após ação explícita na tela de vinculação.
 * Nunca transfere a propriedade de uma conta para outra.
 */
export function claimLegacyData(userId: string): void {
  if (localLegacyAccess(userId) !== 'unclaimed') throw new Error('Os registros locais já estão vinculados ou não podem ser acessados.')
  try {
    localStorage.setItem(OWNER_KEY, userId)
    if (localStorage.getItem(OWNER_KEY) !== userId) throw new Error('Falha ao verificar vínculo.')
  } catch { throw new Error('Não foi possível vincular os dados do navegador. Nada foi apagado.') }
}

export function isLegacyOwnerSession(): boolean {
  return !!verifiedUserId && localLegacyAccess(verifiedUserId) === 'allowed'
}
