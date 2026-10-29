<script setup lang="ts">
import { onMounted, ref } from 'vue'
import UiIcon from './UiIcon.vue'
import { getOnlineIdentity, listOnlineWorkspaces, createOnlineWorkspace } from '../../infrastructure/api/onlineWorkspaces'
import type { OnlineWorkspace } from '../../infrastructure/api/onlineWorkspaces'

const checking = ref(false)
const creating = ref(false)
const authenticatedWithApi = ref(false)
const onlineSpaces = ref<OnlineWorkspace[]>([])
const name = ref('')
const errorMessage = ref('')
const successMessage = ref('')

async function load(): Promise<void> {
  checking.value = true
  authenticatedWithApi.value = false
  errorMessage.value = ''
  successMessage.value = ''
  try {
    await getOnlineIdentity()
    authenticatedWithApi.value = true
    onlineSpaces.value = await listOnlineWorkspaces()
  } catch (cause) {
    onlineSpaces.value = []
    errorMessage.value = cause instanceof Error ? cause.message : 'Não foi possível acessar o backend.'
  } finally {
    checking.value = false
  }
}

async function create(): Promise<void> {
  if (creating.value) return
  creating.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const created = await createOnlineWorkspace(name.value)
    name.value = ''
    onlineSpaces.value = await listOnlineWorkspaces()
    successMessage.value = `Espaço online "${created.name}" criado com seu usuário como proprietário.`
  } catch (cause) {
    errorMessage.value = cause instanceof Error ? cause.message : 'Não foi possível criar o espaço online.'
  } finally {
    creating.value = false
  }
}

onMounted(() => { void load() })
</script>

<template>
  <section class="online-workspaces-panel">
    <div class="online-workspaces-heading">
      <div>
        <h2>Minha conexão com a API</h2>
        <p>Primeiros espaços protegidos pelo login e salvos no PostgreSQL.</p>
      </div>
      <span :class="authenticatedWithApi ? 'online-status active' : 'online-status'">
        <UiIcon :name="authenticatedWithApi ? 'check' : 'info'" :size="14" />
        {{ authenticatedWithApi ? 'Identidade validada' : checking ? 'Verificando...' : 'Não verificada' }}
      </span>
    </div>

    <p class="online-workspaces-warning"><UiIcon name="info" :size="16" />
      <strong>Espaços online são separados dos espaços locais.</strong> Criar um espaço aqui não copia nem publica suas contas, despesas ou orçamentos do navegador.
    </p>

    <button type="button" class="secondary-action online-refresh" :disabled="checking || creating" @click="load">
      <UiIcon name="restore" :size="15" /> {{ checking ? 'Verificando backend...' : 'Atualizar conexão e espaços' }}
    </button>

    <template v-if="authenticatedWithApi && !checking">
      <h3>Espaços online</h3>
      <p v-if="!onlineSpaces.length" class="auth-muted">
        Sua conta está autenticada, mas você ainda não criou nenhum espaço no PostgreSQL.
      </p>
      <div v-else class="online-spaces-list">
        <div v-for="space in onlineSpaces" :key="space.id" class="online-space-item">
          <span class="online-space-icon"><UiIcon name="folder" :size="17" /></span>
          <div><strong>{{ space.name }}</strong>
            <small>{{ space.role === 'OWNER' ? 'Proprietário' : space.role === 'EDITOR' ? 'Editor' : 'Visualização' }} · Banco de dados</small>
          </div>
        </div>
      </div>

      <form class="online-space-form" @submit.prevent="create">
        <label>Nome do novo espaço online
          <input v-model="name" required minlength="2" maxlength="60" placeholder="Ex.: Casa e família" :disabled="creating || checking" />
        </label>
        <button class="primary auth-full-button" type="submit" :disabled="creating || checking">
          <UiIcon name="plus" :size="16" /> {{ creating ? 'Criando...' : 'Criar espaço online vazio' }}
        </button>
      </form>
    </template>

    <p v-if="successMessage" class="success" role="status">{{ successMessage }}</p>
    <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
  </section>
</template>
