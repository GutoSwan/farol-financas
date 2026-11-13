import { describe, expect, it } from 'vitest'
import router from '../src/router/index.ts?raw'
import layout from '../src/presentation/layouts/AppLayout.vue?raw'
import styles from '../src/assets/styles/gifts.css?raw'

describe('Presentes sem espera silenciosa e com acesso protegido', () => {
  it('mostra progresso durante a navegação e limpa após conclusão/erro', () => {
    expect(layout).toContain('loadingGiftRoute')
    expect(layout).toContain('@click="openGiftRoute(); closeMobileMenu(true)"')
    expect(layout).toContain('Abrindo Presentes...')
    expect(layout).toContain('router.afterEach(')
    expect(layout).toContain('router.onError(')
    expect(layout).toContain('role="status"')
    expect(styles).toContain('.gift-route-spinner')
  })
  it('mantém autorização de administrador verificada remotamente, sem duas leituras desnecessárias', () => {
    expect(router).toContain('validatedUser = authenticated ? data.user : null')
    expect(router).toContain('if (!isFarolAdmin(validatedUser))')
    expect(router).toContain("meta: { title: 'Presentes', requiresAdmin: true }")
    expect(router).toContain("const access = localLegacyAccess(validatedUser.id)")
    const body=router.slice(router.indexOf('router.beforeEach(async'), router.indexOf('router.afterEach'))
    expect((body.match(/supabase\.auth\.getUser\(\)/g) ?? [])).toHaveLength(1)
  })
})
