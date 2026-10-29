<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from '../composables/useTheme'
import { useWorkspaces } from '../composables/useWorkspaces'

const route = useRoute()
const { isDark, toggleTheme } = useTheme()
const { workspaces, currentWorkspace, activeWorkspaceId, error: workspaceError, selectWorkspace, createWorkspace } = useWorkspaces()
const creating = ref(false)
const newName = ref('')

const links = [
  ['/', 'Visão geral'],
  ['/contas-mensais', 'Contas mensais'],
  ['/lancamentos', 'Lançamentos'],
  ['/cartoes', 'Cartões de crédito'],
  ['/orcamentos', 'Orçamentos'],
  ['/relatorios', 'Relatórios'],
]

function submitWorkspace(): void {
  if (createWorkspace(newName.value)) {
    creating.value = false
    newName.value = ''
  }
}
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <RouterLink to="/" class="brand">◈ Farol <span>Finanças</span></RouterLink>
      <p class="section-label">SEU CONTROLE FINANCEIRO</p>
      <nav aria-label="Menu principal">
        <RouterLink
          v-for="[href, label] in links"
          :key="href"
          :to="href"
          :class="{ active: route.path === href }"
        >{{ label }}</RouterLink>
      </nav>
      <p class="sidebar-foot">Protótipo • espaços locais</p>
    </aside>
    <div class="main">
      <header class="topbar">
        <b>Farol Finanças</b>
        <div class="topbar-actions">
          <span class="page-context">{{ route.meta.title ?? 'Visão geral' }}</span>
          <div class="workspace-switcher">
            <label class="sr-only" for="workspace-select">Espaço financeiro ativo</label>
            <select
              id="workspace-select"
              class="workspace-select"
              :value="activeWorkspaceId"
              title="Trocar espaço financeiro local"
              @change="selectWorkspace(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="space in workspaces" :key="space.id" :value="space.id">{{ space.name }}</option>
            </select>
            <button
              class="workspace-add"
              type="button"
              title="Criar espaço financeiro neste navegador"
              :aria-expanded="creating"
              @click="creating = !creating"
            >+ Espaço</button>
            <div v-if="creating" class="workspace-popover">
              <form @submit.prevent="submitWorkspace">
                <strong>Novo espaço financeiro</strong>
                <label for="new-workspace-name">Nome</label>
                <input id="new-workspace-name" v-model="newName" maxlength="60" minlength="2" required placeholder="Ex.: Finanças do João" />
                <p>Cada espaço tem registros separados neste navegador. Ainda não é um login para outra pessoa.</p>
                <div class="popover-actions">
                  <button class="secondary-action" type="button" @click="creating = false">Cancelar</button>
                  <button type="submit" class="primary">Criar espaço</button>
                </div>
              </form>
            </div>
          </div>
          <button
            class="theme-toggle"
            type="button"
            :title="isDark ? 'Ativar modo claro' : 'Ativar modo escuro'"
            :aria-label="isDark ? 'Ativar modo claro' : 'Ativar modo escuro'"
            :aria-pressed="isDark"
            @click="toggleTheme"
          >
            <svg v-if="!isDark" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20.98 13.02A9 9 0 0 1 10.98 3.02a9 9 0 1 0 10 10" />
            </svg>
          </button>
        </div>
      </header>
      <p v-if="workspaceError" class="workspace-error" role="alert">{{ workspaceError }}</p>
      <main class="content" :key="activeWorkspaceId">
        <RouterView />
      </main>
      <p class="local-workspace-note">Espaço atual: {{ currentWorkspace?.name ?? 'Gustavo e Ana' }}. Os dados ficam somente neste navegador.</p>
    </div>
  </div>
</template>
