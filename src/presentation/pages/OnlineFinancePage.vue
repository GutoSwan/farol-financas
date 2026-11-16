<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useAuth } from '../composables/useAuth'
import { apiConfigured } from '../../infrastructure/api/apiEndpoint'
import { getOnlineIdentity, listOnlineWorkspaces } from '../../infrastructure/api/onlineWorkspaces'
import type { OnlineWorkspace } from '../../infrastructure/api/onlineWorkspaces'
import { readOnlineFinance } from '../../infrastructure/api/onlineFinance'
import type { OnlineFinanceKind, OnlineFinanceRecord } from '../../infrastructure/api/onlineFinance'
import { formatBRL } from '../../domain/value-objects/Money'

const { user } = useAuth()
const modules: { key: OnlineFinanceKind; label: string }[] = [
  { key: 'recurring-bills', label: 'Contas mensais' },
  { key: 'fixed-expenses', label: 'Gastos fixos' },
  { key: 'transactions', label: 'Lançamentos' },
  { key: 'budgets', label: 'Orçamentos' },
]
const workspaces = ref<OnlineWorkspace[]>([])
const selectedId = ref('')
const selectedModule = ref<OnlineFinanceKind>('recurring-bills')
const records = ref<OnlineFinanceRecord[]>([])
const message = ref('')
const busy = ref(false)
const verified = ref(false)
let generation = 0

function clearRecords(): void {
  generation++
  records.value = []
  verified.value = false
  message.value = ''
}
async function refreshWorkspaces(): Promise<void> {
  clearRecords()
  const seq = generation
  const currentUserId = user.value?.id
  workspaces.value = []
  selectedId.value = ''
  if (!currentUserId) { message.value = 'Entre na sua conta para consultar espaços online.'; return }
  if (!apiConfigured) { message.value = 'A API de Preview não está configurada.'; return }
  busy.value = true
  try {
    const identity = await getOnlineIdentity()
    if (identity.id !== currentUserId) throw new Error('A API retornou outra identidade.')
    const fetched = await listOnlineWorkspaces()
    if (seq !== generation || user.value?.id !== currentUserId) return
    workspaces.value = fetched
    selectedId.value = fetched[0]?.id ?? ''
    message.value = fetched.length ? '' : 'Nenhum espaço online encontrado nesta conta.'
  } catch (cause) {
    if (seq === generation) message.value = cause instanceof Error ? cause.message : 'Erro na consulta online.'
  } finally { if (seq === generation) busy.value = false }
}
async function load(): Promise<void> {
  clearRecords()
  const seq = generation
  const currentUserId = user.value?.id
  const space = workspaces.value.find(w => w.id === selectedId.value)
  if (!space || !currentUserId) return
  busy.value = true
  try {
    const result = await readOnlineFinance(space, selectedModule.value, currentUserId)
    if (seq !== generation || user.value?.id !== currentUserId) return
    records.value = result
    verified.value = true
  } catch (cause) {
    if (seq === generation) message.value = cause instanceof Error ? cause.message : 'Consulta indisponível.'
  } finally { if (seq === generation) busy.value = false }
}
watch(() => user.value?.id, () => { void refreshWorkspaces() }, { immediate: true })
onBeforeUnmount(clearRecords)
</script>

<template>
  <div class="heading">
    <div>
      <p class="eyebrow">AMBIENTE ONLINE · CONSULTA</p>
      <h1>Dados na nuvem</h1>
      <p>Confira as informações protegidas da API, sem misturá-las com seus espaços locais.</p>
    </div>
  </div>
  <div class="notice">
    <strong>Modo somente leitura.</strong> Os dados apresentados aqui vêm da API online e não substituem nem
    sincronizam as informações armazenadas neste navegador. Nenhuma alteração financeira será enviada por esta página.
  </div>
  <section class="panel">
    <div class="panel-title">
      <div><h2>Consultar espaço online</h2><p>Verificação da conexão e das permissões de acesso.</p></div>
    </div>
    <p v-if="!apiConfigured" class="error" role="alert">A URL HTTPS da API ainda não foi configurada para este Preview.</p>
    <div class="form" v-else>
      <label>Espaço financeiro
        <select v-model="selectedId" :disabled="busy || workspaces.length === 0" @change="clearRecords">
          <option v-if="!workspaces.length" value="">Nenhum espaço online</option>
          <option v-for="space in workspaces" :key="space.id" :value="space.id">{{ space.name }} ({{ space.role }})</option>
        </select>
      </label>
      <label>Módulo
        <select v-model="selectedModule" :disabled="busy" @change="clearRecords">
          <option v-for="module in modules" :key="module.key" :value="module.key">{{ module.label }}</option>
        </select>
      </label>
      <div class="row-actions">
        <button type="button" class="secondary-action" :disabled="busy" @click="refreshWorkspaces">Atualizar espaços</button>
        <button type="button" class="primary" :disabled="busy || !selectedId" @click="load">Consultar dados</button>
      </div>
    </div>
    <p v-if="busy" role="status">Consultando API...</p>
    <p v-if="message" class="error" role="alert">{{ message }}</p>
    <template v-if="verified">
      <p role="status">{{ records.length }} registro(s) retornado(s), no máximo 50 por consulta.</p>
      <p v-if="!records.length" class="empty">Nenhum registro neste módulo.</p>
      <div v-else class="scroll">
        <table>
          <thead><tr><th>Descrição</th><th>Valor ou vencimento</th></tr></thead>
          <tbody>
            <tr v-for="record in records" :key="record.id">
              <td>{{ record.label }}</td>
              <td>{{ record.amountCents === undefined ? 'Dia ' + (record.dueDay ?? '—') : formatBRL(record.amountCents) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
