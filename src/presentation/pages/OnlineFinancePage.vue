<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAuth } from '../composables/useAuth'
import { apiConfigured } from '../../infrastructure/api/apiEndpoint'
import { getOnlineIdentity, listOnlineWorkspaces } from '../../infrastructure/api/onlineWorkspaces'
import type { OnlineWorkspace } from '../../infrastructure/api/onlineWorkspaces'
import { readOnlineFinance } from '../../infrastructure/api/onlineFinance'
import type { OnlineFinanceKind, OnlineFinanceRecord } from '../../infrastructure/api/onlineFinance'
import { formatBRL, parseBRLToCents } from '../../domain/value-objects/Money'
import MoneyInput from '../components/MoneyInput.vue'
import { createQaTransaction, updateQaTransaction, deleteQaTransaction, qaTransactionWritesEnabled } from '../../infrastructure/api/qaTransactions'

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
const qaNames = new Set(['QA - Casa compartilhada (Dev)', 'QA - Valora3D compartilhada (Dev)'])
const qaAvailable = computed(() => {
  const space = workspaces.value.find(w => w.id === selectedId.value)
  return qaTransactionWritesEnabled && selectedModule.value === 'transactions' &&
    !!space && qaNames.has(space.name) && (space.role === 'OWNER' || space.role === 'EDITOR')
})
const qaDescription = ref('')
const qaCategory = ref('Feira')
const qaAmount = ref('')
const qaKind = ref<'EXPENSE' | 'INCOME'>('INCOME')
const qaDate = ref(new Date().toLocaleDateString('en-CA'))
const qaEditing = ref<string | null>(null)
const qaEditingVersion = ref<number | null>(null)
const qaFeedback = ref('')
const qaEditorSection = ref<HTMLElement | null>(null)
function resetQa(): void {
  qaEditing.value = null
  qaEditingVersion.value = null
  qaDescription.value = ''
  qaCategory.value = 'Feira'
  qaAmount.value = ''
  qaKind.value = 'INCOME'
  qaDate.value = new Date().toLocaleDateString('en-CA')
}
async function editQa(record: OnlineFinanceRecord): Promise<void> {
  if (typeof record.version !== 'number' || !record.category || !record.kind || !record.occurredOn ||
      record.amountCents === undefined) {
    message.value = 'Não foi possível abrir este lançamento para edição. Consulte os dados novamente.'
    return
  }
  qaEditing.value = record.id
  qaEditingVersion.value = record.version
  qaDescription.value = record.label
  qaCategory.value = record.category
  qaAmount.value = formatBRL(record.amountCents)
  qaKind.value = record.kind
  qaDate.value = record.occurredOn
  qaFeedback.value = ''
  message.value = ''
  // A lista pode ser longa; leve o usuário ao formulário já preenchido.
  await nextTick()
  qaEditorSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  qaEditorSection.value?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
}
async function saveQa(): Promise<void> {
  if (busy.value || !qaAvailable.value) return
  const currentUserId = user.value?.id
  const space = workspaces.value.find(w => w.id === selectedId.value)
  if (!currentUserId || !space) return
  const current = qaEditing.value ? records.value.find(r => r.id === qaEditing.value) : null
  if (qaEditing.value && (!current || !qaEditingVersion.value)) {
    message.value = 'Lançamento antigo. Consulte novamente.'
    return
  }
  busy.value = true
  message.value = ''
  qaFeedback.value = ''
  try {
    const payload = { description: qaDescription.value, category: qaCategory.value,
      amountCents: parseBRLToCents(qaAmount.value), kind: qaKind.value, occurredOn: qaDate.value }
    if (current && qaEditingVersion.value) {
      await updateQaTransaction(space, currentUserId, { id: current.id, version: qaEditingVersion.value }, payload)
      qaFeedback.value = 'Lançamento de teste atualizado na nuvem.'
    } else {
      await createQaTransaction(space, currentUserId, payload)
      qaFeedback.value = 'Lançamento de teste salvo na nuvem.'
    }
    resetQa()
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : 'Não foi possível salvar.'
    return
  } finally { busy.value = false }
  const feedback = qaFeedback.value
  await load()
  qaFeedback.value = feedback
}
async function removeQa(record: OnlineFinanceRecord): Promise<void> {
  if (!qaAvailable.value || busy.value || !record.version ||
      !window.confirm('Excluir este lançamento fictício da nuvem?')) return
  const currentUserId = user.value?.id
  const space = workspaces.value.find(w => w.id === selectedId.value)
  if (!currentUserId || !space) return
  busy.value = true
  message.value = ''
  try {
    await deleteQaTransaction(space, currentUserId, { id: record.id, version: record.version })
    qaFeedback.value = 'Lançamento de teste excluído.'
    resetQa()
  } catch (cause) {
    message.value = cause instanceof Error ? cause.message : 'Não foi possível excluir.'
    return
  } finally { busy.value = false }
  const feedback = qaFeedback.value
  await load()
  qaFeedback.value = feedback
}
let refreshTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  refreshTimer = setInterval(() => {
    if (qaAvailable.value && verified.value && !busy.value && !qaEditing.value && document.visibilityState === 'visible') {
      void load()
    }
  }, 15000)
})

function clearRecords(): void {
  generation++
  records.value = []
  verified.value = false
  message.value = ''
}
async function refreshWorkspaces(): Promise<void> {
  clearRecords()
  resetQa()
  qaFeedback.value = ''
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
onBeforeUnmount(() => {
  if (refreshTimer !== null) clearInterval(refreshTimer)
  clearRecords()
})
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
    <strong>Dados reais continuam locais.</strong> A consulta é online. Somente os espaços
    fictícios compartilhados de Dev permitem criar, editar e excluir lançamentos de teste;
    essas alterações não são importadas para os espaços locais.
  </div>
  <section class="panel">
    <div class="panel-title">
      <div><h2>Consultar espaço online</h2><p>Verificação da conexão e das permissões de acesso.</p></div>
    </div>
    <p v-if="!apiConfigured" class="error" role="alert">A URL HTTPS da API ainda não foi configurada para este Preview.</p>
    <div class="form" v-else>
      <label>Espaço financeiro
        <select v-model="selectedId" :disabled="busy || workspaces.length === 0" @change="clearRecords(); resetQa(); qaFeedback = ''">
          <option v-if="!workspaces.length" value="">Nenhum espaço online</option>
          <option v-for="space in workspaces" :key="space.id" :value="space.id">{{ space.name }} ({{ space.role }})</option>
        </select>
      </label>
      <label>Módulo
        <select v-model="selectedModule" :disabled="busy" @change="clearRecords(); resetQa(); qaFeedback = ''">
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
          <thead><tr><th>Descrição</th><th>Valor ou vencimento</th><th v-if="qaAvailable">Ações QA</th></tr></thead>
          <tbody>
            <tr v-for="record in records" :key="record.id">
              <td>{{ record.label }}</td>
              <td v-if="selectedModule === 'recurring-bills'">
                <span>Vence dia {{ record.dueDay ?? '—' }}</span>
                <template v-if="record.monthlyEntries?.length">
                  <div class="bill-month-summary">
                    {{ record.monthlyEntries[0]!.yearMonth }}:
                    {{ formatBRL(record.monthlyEntries[0]!.amountCents) }}
                    ({{ record.monthlyEntries[0]!.status === 'PAID' ? 'paga' : 'pendente' }})
                  </div>
                  <details v-if="record.monthlyEntries.length > 1">
                    <summary>Histórico ({{ record.monthlyEntries.length }} meses)</summary>
                    <ul>
                      <li v-for="entry in record.monthlyEntries" :key="entry.id">
                        {{ entry.yearMonth }}: {{ formatBRL(entry.amountCents) }}
                        ({{ entry.status === 'PAID' ? 'paga' : 'pendente' }})
                      </li>
                    </ul>
                  </details>
                </template>
                <div v-else class="bill-month-summary">Nenhum valor mensal salvo na nuvem</div>
              </td>
              <td v-else>{{ record.amountCents === undefined ? 'Dia ' + (record.dueDay ?? '—') : formatBRL(record.amountCents) }}</td>
              <td v-if="qaAvailable" class="row-actions">
                <button type="button" :disabled="busy || !record.version" @click="editQa(record)">Editar</button>
                <button type="button" :disabled="busy || !record.version" @click="removeQa(record)">Excluir</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
  <section v-if="qaAvailable" ref="qaEditorSection" class="panel">
    <div class="panel-title">
      <div>
        <h2>{{ qaEditing ? 'Editar lançamento de teste' : 'Novo lançamento de teste' }}</h2>
        <p>Somente Dev: os dois logins veem as alterações no mesmo espaço. Atualização automática a cada 15 segundos fora da edição.</p>
        <p v-if="qaEditing" role="status"><strong>Você está editando este lançamento. Valor carregado: {{ qaAmount }}</strong></p>
      </div>
    </div>
    <form class="form" @submit.prevent="saveQa">
      <label>Descrição <input v-model="qaDescription" required maxlength="120" placeholder="Ex.: Venda na feira" /></label>
      <label>Valor (R$) <MoneyInput v-model="qaAmount" required placeholder="R$ 5,00" /></label>
      <label>Tipo <select v-model="qaKind"><option value="INCOME">Receita</option><option value="EXPENSE">Despesa</option></select></label>
      <label>Categoria <input v-model="qaCategory" required maxlength="40" placeholder="Ex.: Feira" /></label>
      <label>Data <input v-model="qaDate" type="date" required /></label>
      <div class="row-actions">
        <button type="submit" class="primary" :disabled="busy">{{ qaEditing ? 'Salvar alteração QA' : 'Adicionar teste QA' }}</button>
        <button v-if="qaEditing" type="button" class="secondary-action" :disabled="busy" @click="resetQa">Cancelar edição</button>
      </div>
    </form>
    <p v-if="qaFeedback" class="success" role="status">{{ qaFeedback }}</p>
  </section>
</template>
