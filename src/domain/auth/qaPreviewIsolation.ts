/** Exclusivo do QA do Super Admin; impede usar Auth de produção em uma Preview de testes. */
export function mayInitializeAuth(url: string, publishableKey: string, qaDevOnly: boolean): boolean {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) return false
  if (!/^sb_publishable_[a-zA-Z0-9_-]+$/.test(publishableKey)) return false
  if (publishableKey.includes('SUBSTITUA')) return false
  if (qaDevOnly && url.replace(/\/$/, '') !== 'https://tvirkrjkgdtybtcundon.supabase.co') return false
  return true
}
