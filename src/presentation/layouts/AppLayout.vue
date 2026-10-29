<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import UiIcon from '../components/UiIcon.vue'
import { useTheme } from '../composables/useTheme'
import { useWorkspaces } from '../composables/useWorkspaces'
import { useAuth } from '../composables/useAuth'
import { DEFAULT_WORKSPACE_ID } from '../../domain/entities/FinancialWorkspace'
import type { FinancialWorkspace } from '../../domain/entities/FinancialWorkspace'

const route = useRoute()
const { isLoggedIn, user } = useAuth()
const { isDark, toggleTheme } = useTheme()
const { workspaces, currentWorkspace, activeWorkspaceId, error: workspaceError, selectWorkspace, createWorkspace, deleteWorkspace } = useWorkspaces()
const managing = ref(false)
const newName = ref('')
const notice = ref('')

const links = [
  { to: '/', label: 'Visão geral', icon: 'dashboard' as const },
  { to: '/contas-mensais', label: 'Contas mensais', icon: 'receipt' as const },
  { to: '/gastos-fixos', label: 'Gastos fixos', icon: 'repeat' as const },
  { to: '/lancamentos', label: 'Lançamentos', icon: 'wallet' as const },
  { to: '/cartoes', label: 'Cartões de crédito', icon: 'card' as const },
  { to: '/orcamentos', label: 'Orçamentos', icon: 'target' as const },
  { to: '/relatorios', label: 'Relatórios', icon: 'chart' as const },
]

function submitWorkspace(): void {
  notice.value = ''
  if (createWorkspace(newName.value)) {
    notice.value = 'Novo espaço criado.'
    newName.value = ''
  }
}

function removeWorkspace(space: FinancialWorkspace): void {
  if (space.id === DEFAULT_WORKSPACE_ID) return
  const answer = window.prompt(
    `Excluir permanentemente o espaço "${space.name}"?\n\nIsso APAGARÁ todas as contas mensais, despesas fixas e lançamentos deste espaço neste navegador. Não existe recuperação automática.\n\nDigite exatamente: ${space.name}`
  )
  if (answer !== space.name) return
  if (deleteWorkspace(space.id)) {
    notice.value = 'Espaço excluído junto com seus registros locais.'
  }
}
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <RouterLink to="/" class="brand">◈ Farol <span>Finanças</span></RouterLink>
      <p class="section-label">SEU CONTROLE FINANCEIRO</p>
      <nav aria-label="Menu principal">
        <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="side-nav-link" :class="{ active: route.path === link.to }">
          <UiIcon :name="link.icon" :size="17" />
          <span>{{ link.label }}</span>
        </RouterLink>
      </nav>
      <div class="sidebar-workspace">
        <p class="sidebar-workspace-label">ESPAÇO FINANCEIRO</p>
        <p class="sidebar-workspace-name"><UiIcon name="users" :size="17" /> {{ currentWorkspace?.name ?? 'Gustavo e Ana' }}</p>
        <label class="sr-only" for="workspace-select">Trocar espaço financeiro</label>
        <select id="workspace-select" class="workspace-select" :value="activeWorkspaceId" @change="selectWorkspace(($event.target as HTMLSelectElement).value)">
          <option v-for="space in workspaces" :key="space.id" :value="space.id">{{ space.name }}</option>
        </select>
        <button class="workspace-add" type="button" :aria-expanded="managing" @click="managing = !managing">
          <UiIcon name="plus" :size="17" /> Gerenciar espaços
        </button>
        <div v-if="managing" class="workspace-popover">
          <form @submit.prevent="submitWorkspace">
            <strong><UiIcon name="folder" :size="18" /> Novo espaço financeiro</strong>
            <label for="workspace-name">Nome</label>
            <input id="workspace-name" v-model="newName" required minlength="2" maxlength="60" placeholder="Ex.: Finanças do João" />
            <p>Espaços locais não são usuários com login. Dados ficam neste navegador.</p>
            <button class="primary" type="submit"><UiIcon name="plus" :size="16" /> Criar espaço</button>
          </form>
          <div class="workspace-manage-list">
            <h3>Espaços existentes</h3>
            <div v-for="space in workspaces" :key="space.id" class="workspace-manage-row">
              <span>{{ space.name }}<small v-if="space.id === DEFAULT_WORKSPACE_ID">Inicial · protegido</small></span>
              <button v-if="space.id !== DEFAULT_WORKSPACE_ID" type="button" class="icon-action danger" :title="'Excluir ' + space.name" :aria-label="'Excluir espaço ' + space.name" @click="removeWorkspace(space)">
                <UiIcon name="trash" :size="16" />
              </button>
            </div>
          </div>
          <p v-if="notice" class="success" role="status">{{ notice }}</p>
          <button class="secondary-action close-spaces" type="button" @click="managing = false">Fechar</button>
        </div>
        <button class="invite-disabled" type="button" disabled title="Disponível com autenticação e convites">
          <UiIcon name="users" :size="15" /> Adicionar pessoa (em breve)
        </button>
        <p class="sidebar-foot">Protótipo · dados locais</p>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <b>Farol Finanças</b>
        <div class="topbar-actions">
          <span class="page-context">{{ route.meta.title ?? 'Visão geral' }}</span>
          <RouterLink class="header-auth-link" :to="isLoggedIn ? '/conta' : '/entrar'">
            <UiIcon name="users" :size="17" />
            <span>{{ isLoggedIn ? (user?.email ?? 'Minha conta') : 'Entrar' }}</span>
          </RouterLink>
          <button class="theme-toggle" type="button"
            :aria-label="isDark ? 'Ativar modo claro' : 'Ativar modo escuro'"
            :title="isDark ? 'Ativar modo claro' : 'Ativar modo escuro'"
            :aria-pressed="isDark" @click="toggleTheme">
            <UiIcon :name="isDark ? 'sun' : 'moon'" :size="20" />
          </button>
        </div>
      </header>
      <p v-if="workspaceError" class="workspace-error" role="alert">{{ workspaceError }}</p>
      <main class="content" :key="activeWorkspaceId"><RouterView /></main>
    </div>
  </div>
</template>
