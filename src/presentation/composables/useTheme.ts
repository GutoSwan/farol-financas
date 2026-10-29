import { computed, ref } from 'vue'

export type Theme = 'light' | 'dark'
const KEY = 'farol-financas:theme:v1'
const current = ref<Theme>('light')
let initialized = false

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export function useTheme() {
  if (!initialized) {
    initialized = true
    try {
      current.value = localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
    } catch {
      current.value = 'light'
    }
    applyTheme(current.value)
  }

  function toggleTheme(): void {
    current.value = current.value === 'light' ? 'dark' : 'light'
    applyTheme(current.value)
    try {
      localStorage.setItem(KEY, current.value)
    } catch {
      // A preferência ainda funciona nesta sessão.
    }
  }

  return { isDark: computed(() => current.value === 'dark'), toggleTheme }
}
