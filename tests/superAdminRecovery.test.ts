import { describe, expect, it } from 'vitest'
import { allowedSuperAdminRecoveryRoute } from '../src/router/superAdminRecovery'
import routerSource from '../src/router/index.ts?raw'
import authPage from '../src/presentation/pages/AuthPage.vue?raw'

describe('Super Admin: recuperação limitada a senha e 2FA', () => {
  it('não derruba a sessão validada por e-mail na página pública de recuperação',()=>{
    expect(allowedSuperAdminRecoveryRoute('/redefinir-senha',false,false)).toBe(true)
    expect(allowedSuperAdminRecoveryRoute('/redefinir-senha',true,false)).toBe(true)
    expect(routerSource).toContain('if (!allowed) {')
    expect(routerSource).toContain('allowedSuperAdminRecoveryRoute(')
  })
  it('só admite o perfil após recuperação e TOTP verificado',()=>{
    expect(allowedSuperAdminRecoveryRoute('/conta',false,true)).toBe(false)
    expect(allowedSuperAdminRecoveryRoute('/conta',true,false)).toBe(false)
    expect(allowedSuperAdminRecoveryRoute('/conta',true,true)).toBe(true)
    expect(routerSource).toContain("data.currentLevel !== 'aal2' || factors.length === 0")
    expect(routerSource).toContain("superAdminRecoveryProfile = to.path === '/conta'")
  })
  it('nunca libera páginas financeiras nem administração na recuperação',()=>{
    for(const path of ['/', '/lancamentos','/relatorios','/calendario','/presentes','/dados-online','/seguranca','/configurar-2fa','/verificar-2fa','/vincular-dados-locais','/entrar','/administracao']){
      expect(allowedSuperAdminRecoveryRoute(path,true,true)).toBe(false)
    }
    expect(routerSource).toContain('setVerifiedLocalUser(null)')
    expect(routerSource).toContain("signOut({ scope: 'local' })")
  })
  it('esconde links financeiros e ajustes de perfil durante recuperação administrativa',()=>{
    expect(authPage).toContain('restrictedSuperAdminRecovery = computed(')
    expect(authPage).toContain('v-if="!restrictedSuperAdminRecovery" class="profile-quick-links"')
    expect(authPage).toContain('editingProfile && !restrictedSuperAdminRecovery')
    expect(authPage).toContain('Acesso temporário e restrito à troca de senha')
  })
})
