import { describe, expect, it } from 'vitest'
import routerSource from '../src/router/index.ts?raw'
import cloudLayout from '../src/presentation/layouts/CloudOnlyLayout.vue?raw'
import legacyScreen from '../src/presentation/pages/LegacyDataAccessPage.vue?raw'

describe('Consulta na nuvem não expõe registros de outros usuários do navegador', () => {
  it('a rota /dados-online é independente de AppLayout e exige usuário validado', () => {
    expect(routerSource).toContain("path: '/dados-online', component: CloudOnlyLayout")
    expect(routerSource).toContain('requiresFinancialData: true')
    expect(routerSource).not.toContain("path: 'dados-online', component: OnlineFinancePage")
    expect(routerSource).toContain('await supabase.auth.getUser()')
    expect(routerSource).toContain("access === 'different-user'")
    expect(routerSource).toContain("return { path: '/dados-online', replace: true }")
  })

  it('o layout da nuvem não importa nem inicializa módulos financeiros locais', () => {
    expect(cloudLayout).toContain('OnlineFinancePage')
    expect(cloudLayout).not.toContain("from '../composables/useWorkspaces'")
    expect(cloudLayout).not.toContain("from '../../infrastructure/persistence/legacyAccess'")
    expect(cloudLayout).not.toContain('localStorage.')
    expect(cloudLayout).toContain('não são carregados, apagados, transferidos ou vinculados')
  })

  it('a tela de privacidade oferece somente consulta na nuvem, sem transferir a titularidade', () => {
    expect(legacyScreen).toContain('Continuar somente com meus dados na nuvem')
    expect(legacyScreen).toContain('to="/dados-online"')
    expect(legacyScreen).not.toContain('localStorage.removeItem')
  })
})
