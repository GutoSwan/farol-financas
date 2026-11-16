<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UiIcon from '../components/UiIcon.vue'
import BackNavigation from '../components/BackNavigation.vue'
import { useTheme } from '../composables/useTheme'
import { useWorkspaces } from '../composables/useWorkspaces'
import { useAuth } from '../composables/useAuth'
import { localLegacyAccess } from '../../infrastructure/persistence/legacyAccess'
import { VALORA3D_WORKSPACE_ID } from '../../domain/entities/FinancialWorkspace'

const route = useRoute()
const router = useRouter()
const { isLoggedIn, user, profile, signOut } = useAuth()
const localAccessAllowed = computed(() => !!user.value && localLegacyAccess(user.value.id) === 'allowed')
const profileMenuOpen = ref(false)
const profileBusy = ref(false)
const profileError = ref('')
const loadingGiftRoute = ref(false)
function openGiftRoute(): void { loadingGiftRoute.value = true }
// O aviso aparece IMEDIATAMENTE, enquanto o guard aguarda login.
const stopGiftProgress = router.afterEach(() => { loadingGiftRoute.value = false })
const stopGiftError = router.onError(() => { loadingGiftRoute.value = false })
const { isDark, toggleTheme } = useTheme()
const { workspaces, currentWorkspace, activeWorkspaceId, error: workspaceError, selectWorkspace } = useWorkspaces()
const isValoraWorkspace = computed(() => currentWorkspace.value?.id === VALORA3D_WORKSPACE_ID ||
  currentWorkspace.value?.name.trim().replace(/\s+/g, '').toLocaleLowerCase('pt-BR') === 'valora3d')
const mobileMenuOpen = ref(false)
const mobileMenuButton = ref<HTMLButtonElement | null>(null)
const mobileCloseButton = ref<HTMLButtonElement | null>(null)
const sidebarRef = ref<HTMLElement | null>(null)
let originalOverflow = ''

function openMobileMenu(): void {
  mobileMenuOpen.value = true
}

function closeMobileMenu(restoreFocus = false): void {
  if (!mobileMenuOpen.value) return
  mobileMenuOpen.value = false
  if (restoreFocus) void nextTick(() => mobileMenuButton.value?.focus())
}

function handleSidebarTab(event: KeyboardEvent): void {
  if (!mobileMenuOpen.value || event.key !== 'Tab') return
  const focusable = Array.from(
    sidebarRef.value?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])',
    ) ?? [],
  ).filter((element) => element.getClientRects().length > 0)
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function onViewportResize(): void {
  if (window.innerWidth > 700) closeMobileMenu()
}

function selectAndCloseWorkspace(event: Event): void {
  selectWorkspace((event.target as HTMLSelectElement).value)
  closeMobileMenu(true)
}

watch(mobileMenuOpen, async (open) => {
  if (open) {
    originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    await nextTick()
    mobileCloseButton.value?.focus()
  } else {
    document.body.style.overflow = originalOverflow
  }
})

onMounted(() => window.addEventListener('resize', onViewportResize))
onBeforeUnmount(() => {
  window.removeEventListener('resize', onViewportResize)
  stopGiftProgress()
  stopGiftError()
  if (mobileMenuOpen.value) document.body.style.overflow = originalOverflow
})
const links = [
  { to: '/', label: 'Visão geral', icon: 'dashboard' as const },
  { to: '/contas-mensais', label: 'Contas mensais', icon: 'receipt' as const },
  { to: '/gastos-fixos', label: 'Gastos fixos', icon: 'repeat' as const },
  { to: '/lancamentos', label: 'Lançamentos', icon: 'wallet' as const },
  { to: '/cartoes', label: 'Cartões de crédito', icon: 'card' as const },
  { to: '/orcamentos', label: 'Orçamentos', icon: 'target' as const },
  { to: '/relatorios', label: 'Relatórios', icon: 'chart' as const },
]

// O espaço comercial não renderiza conteúdos pessoais mesmo com um link direto.
watch([isValoraWorkspace, () => route.path], ([valora, path]) => {
  if (valora && path === '/presentes') void router.replace('/')
}, { immediate: true })

watch(() => route.fullPath, () => {
  closeMobileMenu(true)
  profileMenuOpen.value = false
})

function closeSidebarMenus(): void {
  profileMenuOpen.value = false
}

async function logoutFromSidebar(): Promise<void> {
  if (profileBusy.value) return
  profileBusy.value = true
  profileError.value = ''
  try {
    await signOut()
    profileMenuOpen.value = false
    await router.push('/entrar')
  } catch (cause) {
    profileError.value = cause instanceof Error ? cause.message : 'Não foi possível sair.'
  } finally {
    profileBusy.value = false
  }
}

</script>

<template>
  <div v-if="localAccessAllowed" class="shell" :class="{ 'shell--valora': isValoraWorkspace }">
    <aside id="farol-sidebar" ref="sidebarRef" class="sidebar" :class="{ 'sidebar--open': mobileMenuOpen }"
      aria-label="Barra lateral do Farol" :role="mobileMenuOpen ? 'dialog' : undefined"
      :aria-modal="mobileMenuOpen ? 'true' : undefined"
      @keydown.esc.stop="closeSidebarMenus(); closeMobileMenu(true)" @keydown.tab="handleSidebarTab">
      <div class="sidebar-top">
      <div class="sidebar-mobile-heading">
        <RouterLink v-if="isValoraWorkspace" to="/" class="brand valora-brand" @click="closeMobileMenu(true)">
          Valora<span>3D</span><small>CRIATIVIDADE QUE GANHA FORMA</small>
        </RouterLink>
        <RouterLink v-else to="/" class="brand" @click="closeMobileMenu(true)">◈ Farol <span>Finanças</span></RouterLink>
        <button ref="mobileCloseButton" type="button" class="sidebar-mobile-close" aria-label="Fechar menu"
          @click="closeSidebarMenus(); closeMobileMenu(true)"><span aria-hidden="true">×</span></button>
      </div>
      <p class="section-label">{{ isValoraWorkspace ? 'FINANÇAS · VALORA3D' : 'SEU CONTROLE FINANCEIRO' }}</p>
      <nav aria-label="Menu principal">
        <RouterLink v-for="link in links" :key="link.to" :to="link.to"
          class="side-nav-link" :class="{ active: route.path === link.to }"
          @click="closeMobileMenu(true)">
          <UiIcon :name="link.icon" :size="17" />
          <span>{{ link.to === '/cartoes' && isValoraWorkspace ? 'Maquininha' : link.label }}</span>
        </RouterLink>
        <RouterLink v-if="!isValoraWorkspace" to="/presentes" class="side-nav-link"
          :class="{ active: route.path === '/presentes' }"
          @click="openGiftRoute(); closeMobileMenu(true)">
          <UiIcon name="gift" :size="17" /><span>Presentes</span>
        </RouterLink>
      </nav>
      </div>
      <div class="sidebar-bottom">
      <div class="sidebar-workspace">
        <p class="sidebar-workspace-label">ESPAÇO FINANCEIRO</p>
        <label class="sr-only" for="workspace-select">Trocar espaço financeiro</label>
        <select id="workspace-select" class="workspace-select" :value="activeWorkspaceId" @change="selectAndCloseWorkspace">
          <option v-for="space in workspaces" :key="space.id" :value="space.id">{{ space.name }}</option>
        </select>

      </div>

      <div class="sidebar-profile">
        <button type="button" class="sidebar-profile-trigger" :aria-expanded="profileMenuOpen"
          aria-label="Abrir opções da minha conta" @click="profileMenuOpen = !profileMenuOpen">
          <span class="sidebar-profile-avatar"><UiIcon :name="isLoggedIn ? profile.avatarIcon : 'user'" :size="23" /></span>
          <span class="sidebar-profile-identification">
            <strong>{{ isLoggedIn ? profile.displayName : 'Minha conta' }}</strong>
            <small>{{ isLoggedIn ? user?.email : 'Entrar no Farol' }}</small>
          </span>
          <UiIcon name="settings" :size="17" />
        </button>
        <div v-if="profileMenuOpen" class="sidebar-profile-menu">
          <RouterLink :to="isLoggedIn ? '/conta' : '/entrar'" @click="profileMenuOpen = false">
            <UiIcon :name="isLoggedIn ? 'edit' : 'user'" :size="16" />
            {{ isLoggedIn ? 'Meu perfil' : 'Entrar no Farol' }}
          </RouterLink>
          <RouterLink v-if="isLoggedIn" to="/backup-financeiro" @click="profileMenuOpen = false">
            <UiIcon name="folder" :size="16" /> Backup e restauração
          </RouterLink>
          <button v-if="isLoggedIn" type="button" :disabled="profileBusy" @click="logoutFromSidebar">
            <UiIcon name="log-out" :size="16" /> {{ profileBusy ? 'Saindo...' : 'Sair da conta' }}
          </button>
          <p>Os dados financeiros ainda ficam armazenados neste navegador.</p>
        </div>
        <p v-if="profileError" class="sidebar-profile-error" role="alert">{{ profileError }}</p>
      </div>
      </div>
    </aside>

    <button v-if="mobileMenuOpen" type="button" class="mobile-drawer-backdrop" aria-label="Fechar menu"
      @click="closeSidebarMenus(); closeMobileMenu(true)"></button>

    <div class="main">
      <header class="topbar">
        <button ref="mobileMenuButton" type="button" class="mobile-menu-toggle" aria-label="Abrir menu"
          aria-controls="farol-sidebar" :aria-expanded="mobileMenuOpen" @click="openMobileMenu">
          <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
        </button>
        <div v-if="isValoraWorkspace" class="valora-topbar-brand" aria-label="Espaço Valora3D">
          <strong class="valora-wordmark">Valora<span>3D</span></strong>
        </div>
        <b v-else>Farol Finanças</b>
        <div class="topbar-actions">
          <span class="page-context">{{ route.path === '/cartoes' && isValoraWorkspace ? 'Maquininha' : route.meta.title ?? 'Visão geral' }}</span>
          <button class="theme-toggle" type="button"
            :aria-label="isDark ? 'Ativar modo claro' : 'Ativar modo escuro'"
            :title="isDark ? 'Ativar modo claro' : 'Ativar modo escuro'"
            :aria-pressed="isDark" @click="toggleTheme">
            <UiIcon :name="isDark ? 'sun' : 'moon'" :size="20" />
          </button>
        </div>
      </header>
      <BackNavigation v-if="route.path !== '/'" />
      <p v-if="workspaceError" class="workspace-error" role="alert">{{ workspaceError }}</p>
      <div v-if="loadingGiftRoute" class="gift-route-loading" role="status" aria-live="polite" aria-label="Abrindo a página de Presentes">
        <span class="gift-route-spinner" aria-hidden="true"></span>
        <div><strong>Abrindo Presentes...</strong><small>Conferindo seu acesso com segurança.</small></div>
      </div>
      <main class="content" :key="activeWorkspaceId">
        <p v-if="isValoraWorkspace && route.path === '/presentes'" class="notice">
          Presentes é uma área pessoal de Gustavo e Ana. Selecione esse espaço para acessar.
        </p>
        <RouterView v-else />
      </main>
    </div>
  </div>
  <div v-else class="auth-screen"><section class="auth-card"><p class="auth-warning">Sessão alterada. Os dados locais foram ocultados.</p><RouterLink to="/vincular-dados-locais" class="primary auth-full-button">Verificar acesso</RouterLink></section></div>
</template>
