import { describe, expect, it } from 'vitest'
import routerSource from '../src/router/index.ts?raw'
import cloudLayout from '../src/presentation/layouts/CloudOnlyLayout.vue?raw'
import legacyScreen from '../src/presentation/pages/LegacyDataAccessPage.vue?raw'
import { requiredMfaRedirect } from '../src/router/mfaNavigation'

describe('Consulta na nuvem não expõe registros de outros usuários do navegador', () => {
  it('a rota /dados-online é independente de AppLayout e protegida com AAL2', () => {
    expect(routerSource).toContain("path: '/dados-online', component: CloudOnlyLayout")
    expect(routerSource).toContain('requiresFinancialData: true')
    expect(routerSource).not.toContain("path: 'dados-online', component: OnlineFinancePage")
    expect(routerSource).toContain('Boolean(to.meta.requiresLegacyData || to.meta.requiresFinancialData)')
    expect(requiredMfaRedirect('/dados-online', true, 'aal1', 'aal2', 1)).toBe('/verificar-2fa')
    expect(requiredMfaRedirect('/dados-online', true, 'aal1', 'aal1', 0)).toBe('/configurar-2fa')
    expect(requiredMfaRedirect('/dados-online', true, 'aal2', 'aal2', 1)).toBe(null)
  })

  it('o layout da nuvem não importa nem inicializa módulos financeiros locais', () => {
    expect(cloudLayout).toContain('OnlineFinancePage')
    expect(cloudLayout).not.toMatch(/from\\s+['"][^'"]*(?:useWorkspaces|legacyAccess|AppLayout)['"]/)
    expect(cloudLayout).not.toMatch(/\\b(?:useWorkspaces|localLegacyAccess|claimLegacyData)\\s*\\(/)
    expect(cloudLayout).toContain('não são carregados, apagados, transferidos ou vinculados')
  })

  it('a tela de privacidade oferece somente consulta na nuvem, sem transferir a titularidade', () => {
    expect(legacyScreen).toContain('Continuar somente com meus dados na nuvem')
    expect(legacyScreen).toContain('to="/dados-online"')
    expect(legacyScreen).not.toContain('localStorage.removeItem')
  })
})
