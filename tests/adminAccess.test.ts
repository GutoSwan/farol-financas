import { describe, expect, it } from 'vitest'
import { isFarolAdmin } from '../src/domain/auth/adminAccess'
import layout from '../src/presentation/layouts/AppLayout.vue?raw'
import routes from '../src/router/index.ts?raw'
import gifts from '../src/presentation/pages/GiftsPage.vue?raw'

describe('Acesso ao painel de Presentes: conta administradora', () => {
  it('somente app_metadata do servidor concede o papel global', () => {
    expect(isFarolAdmin(null)).toBe(false)
    expect(isFarolAdmin({})).toBe(false)
    expect(isFarolAdmin({ app_metadata: { farol_role: 'administrador' } })).toBe(true)
    expect(isFarolAdmin({ app_metadata: { farol_role: 'viewer' } })).toBe(false)
    expect(isFarolAdmin({ app_metadata: { role: 'admin' } })).toBe(false)
    expect(isFarolAdmin({
      app_metadata: { farol_role: 'authenticated' },
      user_metadata: { display_name: 'administrador' },
    } as unknown as { app_metadata: Record<string, unknown> })).toBe(false)
    expect(isFarolAdmin({ app_metadata: { role: 'OWNER' } })).toBe(false)
  })

  it('oculta o menu, usa guarda da rota e verifica usuário com Supabase Auth', () => {
    expect(layout).toContain('v-if="isAdmin"')
    expect(layout).toContain('to="/presentes"')
    expect(routes).toContain("meta: { title: 'Presentes', requiresAdmin: true }")
    expect(routes).toContain('supabase.auth.getUser()')
    expect(routes).toContain('isFarolAdmin(validatedUser)')
  })

  it('a página também impede leitura, criação e exclusão sem papel de admin', () => {
    expect(gifts).toContain('v-if="isAdmin"')
    expect(gifts).toContain('if (!isAdmin.value')
  })
})
