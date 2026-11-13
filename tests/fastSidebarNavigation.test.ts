import { describe, expect, it } from 'vitest'
import {
  canReuseSidebarAuth, isFastSidebarPath, MAX_SIDEBAR_AUTH_AGE_MS,
} from '../src/router/fastSidebarNavigation'
import routeSource from '../src/router/index.ts?raw'

const now = 2_000_000_000_000
const trusted = {
  userId: 'u1', accessToken: 'jwt-verified-with-aal2',
  verifiedAt: now - 3_000, expiresAt: Math.floor((now + 600_000) / 1000),
}
const current = {
  userId: 'u1', accessToken: trusted.accessToken, expiresAt: trusted.expiresAt,
}
describe('Troca rápida e protegida das abas financeiras', () => {
  it('inclui apenas abas principais, nunca funcionalidades sensíveis', () => {
    for (const path of ['/', '/contas-mensais', '/gastos-fixos', '/lancamentos',
      '/cartoes', '/orcamentos', '/relatorios', '/calendario']) {
      expect(isFastSidebarPath(path)).toBe(true)
    }
    for (const path of ['/conta', '/presentes', '/seguranca', '/dados-online',
      '/backup-financeiro', '/revisar-migracao', '/entrar',
      '/redefinir-senha', '/verificar-2fa', '/configurar-2fa', '/administracao']) {
      expect(isFastSidebarPath(path)).toBe(false)
    }
  })
  it('reutiliza somente o mesmo JWT validado recentemente', () => {
    expect(canReuseSidebarAuth(trusted, current, now)).toBe(true)
    expect(canReuseSidebarAuth(trusted, {...current, accessToken:'other'}, now)).toBe(false)
    expect(canReuseSidebarAuth(trusted, {...current, userId:'other'}, now)).toBe(false)
    expect(canReuseSidebarAuth(trusted, {...current, expiresAt: null}, now)).toBe(false)
    expect(canReuseSidebarAuth(trusted, {...current, expiresAt: trusted.expiresAt + 120}, now)).toBe(false)
  })
  it('obriga verificação completa após TTL ou perto do vencimento do token', () => {
    expect(canReuseSidebarAuth(trusted, current, now + MAX_SIDEBAR_AUTH_AGE_MS + 1)).toBe(false)
    expect(canReuseSidebarAuth(trusted, current, trusted.verifiedAt - 1)).toBe(false)
    const almostExpired = {...trusted, expiresAt: Math.floor((now + 10_000)/1000)}
    expect(canReuseSidebarAuth(almostExpired, {...current, expiresAt: almostExpired.expiresAt}, now)).toBe(false)
  })
  it('não pula revalidação de MFA, vínculo local nem mudança de sessão', () => {
    expect(routeSource).toContain('mfaAal2Verified = data.currentLevel')
    expect(routeSource).toContain("localLegacyAccess(current.user.id) === 'allowed'")
    expect(routeSource).toContain('recentSidebarAuth &&')
    expect(routeSource).toContain('!recoveringPassword.value')
    expect(routeSource).toContain("event !== 'INITIAL_SESSION'")
    expect(routeSource).toContain("window.addEventListener('storage'")
    expect(routeSource).toContain("window.addEventListener('focus'")
    expect(routeSource).toContain("document.addEventListener('visibilitychange'")
    expect(routeSource).toContain('isFastSidebarPath(to.path)')
    expect(routeSource).toContain('getAuthenticatorAssuranceLevel()')
    expect(routeSource).toContain('supabase.auth.getUser()')
  })
})
