import { computed, ref } from 'vue'
import { supabase } from '../../infrastructure/auth/supabase'

export type Theme = 'light' | 'dark'
const KEY = 'farol-financas:theme:v1'
const PROFILE_KEY = 'farol_theme'
const current = ref<Theme>('light')
let initialized = false
let remoteSaveQueue: Promise<void> = Promise.resolve()

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

function rememberTheme(theme: Theme): void {
  current.value = theme
  applyTheme(theme)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // A preferência continua ativa nesta aba se o navegador bloquear o armazenamento.
  }
}

/** Restaurar antes do Vue montar, inclusive nas telas de login e cadastro. */
export function initializeTheme(): void {
  if (initialized) return
  initialized = true
  let stored: string | null = null
  try {
    stored = localStorage.getItem(KEY)
  } catch {
    // Sessão privada ou armazenamento indisponível: usar tema claro.
  }
  current.value = stored === 'dark' ? 'dark' : 'light'
  applyTheme(current.value)

  // Preferência compartilhada entre abas da mesma origem.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key === KEY && isTheme(event.newValue)) {
        current.value = event.newValue
        applyTheme(current.value)
      }
    })
  }
}

/** Pref. da conta, quando existir, prevalece sobre o navegador e outros links Preview. */
export function restoreThemeFromProfile(theme: unknown): void {
  if (!isTheme(theme)) return
  initializeTheme()
  rememberTheme(theme)
}

function persistAccountTheme(theme: Theme): void {
  const client = supabase
  if (!client) return
  // Serializa alterações rápidas: a última escolha deve ser a última gravada.
  remoteSaveQueue = remoteSaveQueue
    .then(async () => {
      const { data, error } = await client.auth.getSession()
      if (error || !data.session) return
      await client.auth.updateUser({ data: { [PROFILE_KEY]: theme } })
    })
    .catch(() => {
      // A preferência local permanece válida mesmo que a nuvem falhe.
    })
}

export function useTheme() {
  initializeTheme()

  function toggleTheme(): void {
    const next: Theme = current.value === 'light' ? 'dark' : 'light'
    rememberTheme(next)
    // Preferência não financeira: salva na conta autenticada para outros links e dispositivos.
    persistAccountTheme(next)
  }

  return { isDark: computed(() => current.value === 'dark'), toggleTheme }
}
