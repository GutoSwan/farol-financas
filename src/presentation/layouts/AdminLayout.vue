<script setup lang="ts">
import BackNavigation from '../components/BackNavigation.vue'
import { useTheme } from '../composables/useTheme'
import UiIcon from '../components/UiIcon.vue'

/**
 * Administração não importa useWorkspaces nem componentes de persistência local.
 * Assim pode abrir em um dispositivo novo sem ler dados locais de outra pessoa.
 */
const { isDark, toggleTheme } = useTheme()
</script>

<template>
  <div class="superadmin-shell">
    <header class="superadmin-topbar">
      <RouterLink to="/" class="superadmin-brand">◈ Farol <span>Finanças</span></RouterLink>
      <div class="superadmin-top-actions">
        <span>Área administrativa</span>
        <button type="button" class="theme-toggle"
          :aria-label="isDark ? 'Ativar tema claro' : 'Ativar tema escuro'"
          @click="toggleTheme"><UiIcon :name="isDark ? 'sun' : 'moon'" :size="20" /></button>
      </div>
    </header>
    <BackNavigation fallback="/conta" />
    <main class="superadmin-content"><RouterView /></main>
  </div>
</template>
