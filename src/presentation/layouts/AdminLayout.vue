<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import BackNavigation from '../components/BackNavigation.vue'
import UiIcon from '../components/UiIcon.vue'

/**
 * A aparência invertida pertence somente ao console. Não muda o tema
 * global nem cria acesso a dados financeiros.
 */
const route = useRoute()
const isDev = import.meta.env.VITE_FAROL_QA_DEV_ONLY === 'true'
const currentSection = computed(() => {
  if (route.path.endsWith('/backup')) return 'Backup'
  if (route.path.endsWith('/seguranca')) return 'Segurança'
  if (route.path.endsWith('/dados')) return 'Dados na nuvem'
  return 'Painel'
})
const navigation = [
  { to: '/administracao', label: 'Painel' },
  { to: '/administracao/backup', label: 'Backup' },
  { to: '/administracao/dados', label: 'Dados na nuvem' },
  { to: '/administracao/seguranca', label: 'Segurança' },
]
</script>

<template>
  <div class="superadmin-shell">
    <div class="superadmin-status-strip">
      <span class="superadmin-status-indicator" aria-hidden="true"></span>
      SUPER ADMIN <span aria-hidden="true">/</span>
      <span>{{ isDev ? 'AMBIENTE DEV • ACESSO RESTRITO' : 'ACESSO RESTRITO' }}</span>
    </div>
    <header class="superadmin-topbar">
      <div class="superadmin-identity">
        <RouterLink to="/administracao" class="superadmin-mark" aria-label="Página inicial do Super Admin">
          <UiIcon name="shield-check" :size="27" />
        </RouterLink>
        <div>
          <p class="superadmin-overline">FAROL FINANÇAS / CONSOLE SEPARADO</p>
          <RouterLink to="/administracao" class="superadmin-brand">
            Central <span>Super Admin</span>
          </RouterLink>
          <p class="superadmin-caption">Você está na área administrativa, não na tela de login.</p>
        </div>
      </div>
      <RouterLink class="superadmin-exit" to="/">
        <UiIcon name="arrow-left" :size="17" /> Sair do Super Admin
      </RouterLink>
    </header>

    <nav class="superadmin-nav" aria-label="Ferramentas Super Admin">
      <RouterLink v-for="item in navigation" :key="item.to" :to="item.to"
        :aria-current="route.path === item.to ? 'page' : undefined"
        :class="{ active: route.path === item.to }">
        {{ item.label }}
      </RouterLink>
    </nav>

    <div class="superadmin-breadcrumb" aria-label="Localização">
      <span>Console Super Admin</span>
      <span aria-hidden="true">/</span>
      <strong>{{ currentSection }}</strong>
    </div>
    <BackNavigation fallback="/administracao" home-to="/administracao" home-label="Painel Super Admin" />

    <main id="superadmin-main" class="superadmin-content">
      <RouterView />
    </main>

    <footer class="superadmin-footer">
      <strong>SUPER ADMIN</strong> <span>Área técnica isolada do Farol comum. A segurança depende das permissões do servidor, não das cores.</span>
    </footer>
  </div>
</template>
