<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MoneyInput from '../components/MoneyInput.vue'
import UiIcon from '../components/UiIcon.vue'
import { useBills } from '../composables/useBills'
import { parseBRLToCents, formatBRL } from '../../domain/value-objects/Money'
import { changePercentage, getPreviousEntry } from '../../domain/services/billAnalytics'
import { currentYearMonth, formatYearMonth } from '../../shared/date'
import type { MonthlyBillEntry } from '../../domain/entities/MonthlyBillEntry'
import type { RecurringBill } from '../../domain/entities/RecurringBill'

const { bills, entries, error, addBill, saveEntry, deleteEntry, updateBill, setBillActive, removeBill } = useBills()
const newName = ref('')
const newDueDay = ref(10)
const selectedId = ref('')
const showArchived = ref(false)
const editing = ref(false)
const editName = ref('')
const editDueDay = ref(10)
const month = ref(currentYearMonth())
const amount = ref('')
const status = ref<'paid' | 'pending'>('pending')
const message = ref('')
const localError = ref('')

const visibleBills = computed(() => bills.value.filter((bill) => bill.active || showArchived.value))
const selected = computed(() => bills.value.find((bill) => bill.id === selectedId.value))
const history = computed(() => entries.value.filter((entry) => entry.billId === selectedId.value)
  .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth)))
const current = computed(() => history.value.find((entry) => entry.yearMonth === month.value))
const previous = computed(() => getPreviousEntry(entries.value, selectedId.value, month.value))

watch([bills, showArchived], () => {
  if (!visibleBills.value.some((item) => item.id === selectedId.value)) {
    selectedId.value = visibleBills.value[0]?.id ?? ''
  }
}, { immediate: true })

watch([selectedId, month, current], () => {
  amount.value = current.value ? formatBRL(current.value.amountCents) : ''
  status.value = current.value?.status ?? 'pending'
  localError.value = ''
}, { immediate: true })

watch(selectedId, () => { editing.value = false; message.value = '' })

function notify(messageText: string): void {
  message.value = messageText
  localError.value = ''
}

function create(): void {
  message.value = ''
  const id = addBill(newName.value, Number(newDueDay.value))
  if (id) {
    showArchived.value = false
    selectedId.value = id
    newName.value = ''
    newDueDay.value = 10
    notify('Conta cadastrada com sucesso.')
  }
}

function record(): void {
  message.value = ''
  localError.value = ''
  try {
    if (saveEntry(selectedId.value, month.value, parseBRLToCents(amount.value), status.value)) {
      notify('Valor mensal salvo com sucesso.')
    }
  } catch (cause) {
    localError.value = cause instanceof Error ? cause.message : 'Valor inválido.'
  }
}

function editBill(bill: RecurringBill): void {
  selectedId.value = bill.id
  editName.value = bill.name
  editDueDay.value = bill.dueDay
  editing.value = true
}

function saveBillEdit(): void {
  if (!selected.value) return
  if (updateBill(selected.value.id, editName.value, Number(editDueDay.value))) {
    editing.value = false
    notify('Nome e vencimento atualizados.')
  }
}

function archiveBill(bill: RecurringBill): void {
  if (bill.active && !window.confirm(`Arquivar "${bill.name}"? O histórico será mantido e novos registros mensais serão bloqueados.`)) return
  if (setBillActive(bill.id, !bill.active)) {
    if (bill.active) showArchived.value = true
    notify(bill.active ? 'Conta arquivada sem apagar o histórico.' : 'Conta reativada.')
  }
}

function deleteBill(bill: RecurringBill): void {
  const count = entries.value.filter((item) => item.billId === bill.id).length
  const answer = window.prompt(
    `Excluir permanentemente a conta "${bill.name}" e seus ${count} registro(s) mensais?\n\nPara confirmar, digite exatamente o nome da conta: ${bill.name}`
  )
  if (answer !== bill.name) return
  if (removeBill(bill.id)) {
    editing.value = false
    notify('Conta e histórico excluídos. Ela não aparecerá mais na seleção.')
  }
}

function deleteMonth(entry: MonthlyBillEntry): void {
  if (!window.confirm(`Excluir o registro de ${formatYearMonth(entry.yearMonth)} (${formatBRL(entry.amountCents)})? Os demais meses serão preservados.`)) return
  if (deleteEntry(entry.id)) notify('Registro mensal excluído.')
}

function compare(a: number, b: number): string {
  const delta = changePercentage(a, b)
  return delta === null ? '—' : (delta > 0 ? '+' : '') + delta.toFixed(1).replace('.', ',') + '%'
}
</script>

<template>
  <div class="heading">
    <div><p class="eyebrow">VALORES QUE VARIAM</p><h1>Contas mensais</h1>
      <p>Cadastre a conta uma vez, acompanhe a evolução e corrija os registros quando precisar.</p></div>
  </div>
  <div class="finance-flow">
    <section class="panel">
      <div class="panel-title">
        <div><h2>Minhas contas mensais</h2><p>Edite, arquive ou exclua cada conta sem afetar as demais.</p></div>
        <span class="count-chip">{{ bills.filter((bill) => bill.active).length }} ativa(s)</span>
      </div>
      <form class="form compact-form" @submit.prevent="create">
        <label>Nome da conta<input v-model="newName" required minlength="2" maxlength="80" placeholder="Ex.: Energia elétrica" /></label>
        <label>Dia de vencimento<input v-model.number="newDueDay" type="number" min="1" max="31" required /></label>
        <button class="primary" type="submit"><UiIcon name="plus" :size="16" /> Cadastrar conta</button>
      </form>
      <label class="toggle-row"><input v-model="showArchived" type="checkbox" /> Mostrar contas arquivadas</label>
      <div v-if="!visibleBills.length" class="empty">Nenhuma conta nesta lista. Cadastre uma conta para começar.</div>
      <div v-else class="account-list">
        <article v-for="bill in visibleBills" :key="bill.id" class="account-row" :class="{ selected: selectedId === bill.id, mutedAccount: !bill.active }">
          <button class="account-choose" type="button" @click="selectedId = bill.id">
            <strong>{{ bill.name }}</strong>
            <small>Dia {{ bill.dueDay }} · {{ bill.active ? 'Ativa' : 'Arquivada' }} · {{ entries.filter((entry) => entry.billId === bill.id).length }} mês(es)</small>
          </button>
          <div class="account-actions">
            <button type="button" class="icon-action" :aria-label="'Editar ' + bill.name" :title="'Editar ' + bill.name" @click="editBill(bill)"><UiIcon name="edit" :size="17" /></button>
            <button type="button" class="icon-action" :aria-label="(bill.active ? 'Arquivar ' : 'Reativar ') + bill.name" :title="bill.active ? 'Arquivar' : 'Reativar'" @click="archiveBill(bill)"><UiIcon :name="bill.active ? 'archive' : 'restore'" :size="17" /></button>
            <button type="button" class="icon-action danger" :aria-label="'Excluir conta ' + bill.name" :title="'Excluir conta ' + bill.name" @click="deleteBill(bill)"><UiIcon name="trash" :size="17" /></button>
          </div>
        </article>
      </div>
      <form v-if="editing && selected" class="edit-account-form" @submit.prevent="saveBillEdit">
        <h3>Editar {{ selected.name }}</h3>
        <label>Nome<input v-model="editName" maxlength="80" minlength="2" required /></label>
        <label>Vencimento<input v-model.number="editDueDay" type="number" min="1" max="31" required /></label>
        <div class="action-row"><button type="submit" class="primary">Salvar alterações</button><button type="button" class="secondary-action" @click="editing = false">Cancelar</button></div>
      </form>
    </section>

    <section class="panel">
      <div class="panel-title">
        <div><h2>Registrar valor do mês</h2><p>Escolha uma conta e o mês de referência.</p></div>
      </div>
      <form class="form compact-form" @submit.prevent="record">
        <label>Conta
          <select v-model="selectedId" required :disabled="!visibleBills.length">
            <option disabled value="">Selecione</option>
            <option v-for="bill in visibleBills" :key="bill.id" :value="bill.id">{{ bill.name }}{{ bill.active ? '' : ' (arquivada)' }}</option>
          </select>
        </label>
        <label>Mês<input v-model="month" type="month" required /></label>
        <label>Valor (R$)<MoneyInput v-model="amount" required :disabled="!selected?.active" /></label>
        <label>Situação
          <select v-model="status" :disabled="!selected?.active"><option value="pending">Pendente</option><option value="paid">Pago</option></select>
        </label>
        <button v-if="previous && !current && selected?.active" type="button" class="secondary-action copy-previous"
          @click="amount = formatBRL(previous.amountCents)">
          <UiIcon name="restore" :size="16" /> Usar valor de {{ formatYearMonth(previous.yearMonth) }}
        </button>
        <button type="submit" class="primary" :disabled="!selected?.active">{{ current ? 'Atualizar registro' : 'Registrar valor' }}</button>
      </form>
      <p v-if="selected && !selected.active" class="notice">Conta arquivada: reative-a para cadastrar novos valores. O histórico permanece abaixo.</p>
      <div v-if="current && previous" class="comparison">
        <span>Em relação a {{ formatYearMonth(previous.yearMonth) }}</span>
        <strong>{{ formatBRL(Math.abs(current.amountCents - previous.amountCents)) }}</strong>
        <b :class="current.amountCents > previous.amountCents ? 'expense-text' : 'positive-text'">{{ compare(current.amountCents, previous.amountCents) }}</b>
      </div>
      <p v-if="message" class="success" role="status">{{ message }}</p>
      <p v-if="localError || error" class="error" role="alert">{{ localError || error }}</p>
    </section>

    <section class="panel">
      <div class="panel-title">
        <div><h2>Histórico mensal {{ selected ? 'de ' + selected.name : '' }}</h2><p>Você pode excluir somente um mês com a lixeira bordô.</p></div>
      </div>
      <p v-if="!history.length" class="empty">Ainda não há valores registrados para esta conta.</p>
      <div v-else class="scroll">
        <table>
          <thead><tr><th>Mês</th><th>Situação</th><th>Valor</th><th>Variação</th><th>Ações</th></tr></thead>
          <tbody><tr v-for="(entry, index) in history" :key="entry.id">
            <td>{{ formatYearMonth(entry.yearMonth) }}</td>
            <td>{{ entry.status === 'paid' ? 'Pago' : 'Pendente' }}</td>
            <td>{{ formatBRL(entry.amountCents) }}</td>
            <td :class="index < history.length - 1 && entry.amountCents > history[index + 1].amountCents ? 'expense-text' : 'positive-text'">
              {{ index < history.length - 1 ? compare(entry.amountCents, history[index + 1].amountCents) : '—' }}
            </td>
            <td><button class="icon-action danger" type="button" :aria-label="'Excluir somente ' + formatYearMonth(entry.yearMonth)" @click="deleteMonth(entry)"><UiIcon name="trash" :size="18" /></button></td>
          </tr></tbody>
        </table>
      </div>
    </section>
  </div>
</template>
