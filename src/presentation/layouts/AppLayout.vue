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
      <div class="sidebar-workspace">
        <p class="sidebar-workspace-label">ESPAÇO FINANCEIRO</p>
        <p class="sidebar-workspace-name">{{ currentWorkspace?.name ?? 'Gustavo e Ana' }}</p>
        <label class="sr-only" for="workspace-select">Trocar espaço financeiro local</label>
        <select
          id="workspace-select"
          class="workspace-select"
          :value="activeWorkspaceId"
          @change="selectWorkspace(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="space in workspaces" :key="space.id" :value="space.id">{{ space.name }}</option>
        </select>
        <button
          type="button"
          class="workspace-add"
          :aria-expanded="creating"
          @click="creating = !creating"
        >+ Novo espaço</button>
        <div v-if="creating" class="workspace-popover">
          <form @submit.prevent="submitWorkspace">
            <strong>Novo espaço financeiro</strong>
            <label for="new-workspace-name">Nome</label>
            <input id="new-workspace-name" v-model="newName" maxlength="60" minlength="2" required placeholder="Ex.: Finanças do João" />
            <p>Os espaços são separados apenas neste navegador. Isto ainda não cria uma conta com login.</p>
            <div class="popover-actions">
              <button class="secondary-action" type="button" @click="creating = false">Cancelar</button>
              <button type="submit" class="primary">Criar</button>
            </div>
          </form>
        </div>
        <button class="invite-disabled" type="button" disabled title="Disponível quando tivermos login e convites">+ Adicionar pessoa (em breve)</button>
        <p class="sidebar-foot">Protótipo • dados locais</p>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <b>Farol Finanças</b>
        <div class="topbar-actions">
          <span class="page-context">{{ route.meta.title ?? 'Visão geral' }}</span>
          <button
            class="theme-toggle"
            type="button"
            :title="isDark ? 'Ativar modo claro' : 'Ativar modo escuro'"
            :aria-label="isDark ? 'Ativar modo claro' : 'Ativar modo escuro'"
            :aria-pressed="isDark"
            @click="toggleTheme"
          >
            <svg v-if="!isDark" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20.98 13.02A9 9 0 0 1 10.98 3.02a9 9 0 1 0 10 10"/>
            </svg>
          </button>
        </div>
      </header>
      <p v-if="workspaceError" class="workspace-error" role="alert">{{ workspaceError }}</p>
      <main class="content" :key="activeWorkspaceId">
        <RouterView />
      </main>
    </div>
  </div>
</template>
