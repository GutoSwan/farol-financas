<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useAuth } from '../composables/useAuth'
import { apiConfigured } from '../../infrastructure/api/apiEndpoint'
import { getOnlineIdentity, listOnlineWorkspaces } from '../../infrastructure/api/onlineWorkspaces'
import type { OnlineWorkspace } from '../../infrastructure/api/onlineWorkspaces'
import UiIcon from './UiIcon.vue'

const { user } = useAuth()
const onlineSpaces = ref<OnlineWorkspace[]>([])
const loading = ref(false)
const verified = ref(false)
const error = ref('')
let requestSequence = 0

async function refresh(): Promise<void> {
  const requestId = ++requestSequence
  const expectedUserId = user.value?.id
  // Não manter informações de um usuário anterior ao trocar/sair da sessão.
  onlineSpaces.value = []
  verified.value = false
  error.value = ''
  loading.value = false

  if (!expectedUserId || !apiConfigured) return
  loading.value = true
  try {
    const identity = await getOnlineIdentity()
    // A API e a sessão precisam se referir à mesma conta autenticada.
    if (identity.id !== expectedUserId) throw new Error('A identidade da API não corresponde à sessão atual.')
    const fetched = await listOnlineWorkspaces()
    if (requestId !== requestSequence || user.value?.id !== expectedUserId) return
    onlineSpaces.value = fetched
    verified.value = true
  } catch (cause) {
    if (requestId !== requestSequence || user.value?.id !== expectedUserId) return
    error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar os espaços online.'
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

watch(() => user.value?.id, () => { void refresh() }, { immediate: true })
onBeforeUnmount(() => { requestSequence++ })
</script>

<template>
  <section class="sidebar-online-section" aria-label="Espaços financeiros online">
    <div class="sidebar-online-heading">
      <div>
        <h3><UiIcon name="folder" :size="16" /> Espaços online</h3>
        <small>Somente consulta nesta etapa</small>
      </div>
      <button v-if="user && apiConfigured" class="sidebar-online-refresh" type="button"
        :disabled="loading" aria-label="Atualizar espaços online" @click="refresh">
        {{ loading ? 'Consultando...' : 'Atualizar' }}
      </button>
    </div>
    <p class="sidebar-online-explanation">
      O seletor acima usa dados deste navegador. Os espaços online ficam separados até concluirmos a sincronização.
    </p>
    <p v-if="!user" class="sidebar-online-feedback">
      <RouterLink to="/entrar">Entre na sua conta</RouterLink> para consultar os espaços salvos no Supabase.
    </p>
    <p v-else-if="!apiConfigured" class="sidebar-online-feedback">
      A conexão com a API ainda não foi configurada neste ambiente.
    </p>
    <p v-else-if="loading" class="sidebar-online-feedback" role="status">Consultando espaços online...</p>
    <p v-else-if="error" class="sidebar-online-feedback sidebar-online-error" role="alert">{{ error }}</p>
    <template v-else-if="verified">
      <p v-if="onlineSpaces.length === 0" class="sidebar-online-feedback">
        Nenhum espaço online cadastrado para sua conta.
      </p>
      <ul v-else class="sidebar-online-list">
        <li v-for="space in onlineSpaces" :key="space.id">
          <span>{{ space.name }}</span>
          <small>{{ space.role === 'OWNER' ? 'Proprietário' : space.role === 'EDITOR' ? 'Editor' : 'Visualização' }}</small>
        </li>
      </ul>
      <RouterLink class="sidebar-online-account" to="/conta">
        <UiIcon name="user" :size="14" /> Ver conexão com a API
      </RouterLink>
    </template>
  </section>
</template>
