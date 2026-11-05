import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateUser: vi.fn(),
}))
vi.mock('../src/infrastructure/auth/supabase', () => ({
  supabase: { auth: authMocks },
}))

const memory = new Map<string, string>()
const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> }

beforeEach(() => {
  memory.clear()
  root.dataset = {}
  root.style = {}
  vi.resetModules()
  authMocks.getSession.mockReset()
  authMocks.updateUser.mockReset()
  authMocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  authMocks.updateUser.mockResolvedValue({ error: null })
  vi.stubGlobal('document', { documentElement: root, createElement: () => ({}) })
  vi.stubGlobal('window', { addEventListener: vi.fn() })
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value) },
  })
})

afterEach(() => { vi.unstubAllGlobals() })

describe('Preferência de tema entre login, logout e Preview', () => {
  it('aplica o modo escuro guardado antes de montar a aplicação', async () => {
    memory.set('farol-financas:theme:v1', 'dark')
    const { initializeTheme, useTheme } = await import('../src/presentation/composables/useTheme')
    initializeTheme()
    expect(root.dataset.theme).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
    expect(useTheme().isDark.value).toBe(true)
  })

  it('mantém escolha local após recarregar o módulo e sem login', async () => {
    const first = await import('../src/presentation/composables/useTheme')
    first.useTheme().toggleTheme()
    expect(memory.get('farol-financas:theme:v1')).toBe('dark')
    vi.resetModules()
    root.dataset = {}
    const second = await import('../src/presentation/composables/useTheme')
    second.initializeTheme()
    expect(second.useTheme().isDark.value).toBe(true)
    expect(root.dataset.theme).toBe('dark')
    expect(authMocks.updateUser).not.toHaveBeenCalled()
  })

  it('recupera o tema salvo no perfil de outro endereço Preview', async () => {
    memory.set('farol-financas:theme:v1', 'light')
    const theme = await import('../src/presentation/composables/useTheme')
    theme.initializeTheme()
    theme.restoreThemeFromProfile('dark')
    expect(theme.useTheme().isDark.value).toBe(true)
    expect(memory.get('farol-financas:theme:v1')).toBe('dark')
    theme.restoreThemeFromProfile('qualquer-coisa')
    expect(theme.useTheme().isDark.value).toBe(true)
  })

  it('salva também no perfil da conta quando existe sessão', async () => {
    authMocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'teste' }, access_token: 'token' } }, error: null,
    })
    const { useTheme } = await import('../src/presentation/composables/useTheme')
    useTheme().toggleTheme()
    await vi.waitFor(() => {
      expect(authMocks.updateUser).toHaveBeenCalledWith({ data: { farol_theme: 'dark' } })
    })
    expect(memory.get('farol-financas:theme:v1')).toBe('dark')
  })

  it('persiste as alterações na ordem mesmo com alternâncias rápidas', async () => {
    authMocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'teste' }, access_token: 'token' } }, error: null,
    })
    const { useTheme } = await import('../src/presentation/composables/useTheme')
    useTheme().toggleTheme()
    useTheme().toggleTheme()
    await vi.waitFor(() => { expect(authMocks.updateUser).toHaveBeenCalledTimes(2) })
    expect(authMocks.updateUser.mock.calls.map((call) => call[0])).toEqual([
      { data: { farol_theme: 'dark' } }, { data: { farol_theme: 'light' } },
    ])
  })
})
