<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MoneyInput from '../components/MoneyInput.vue'
import { useBills } from '../composables/useBills'
import { parseBRLToCents, formatBRL } from '../../domain/value-objects/Money'
import { changePercentage, getPreviousEntry } from '../../domain/services/billAnalytics'
import { currentYearMonth, formatYearMonth } from '../../shared/date'
import type { MonthlyBillEntry } from '../../domain/entities/MonthlyBillEntry'

const { bills, entries, error, addBill, saveEntry, deleteEntry } = useBills()
const name = ref('')
const dueDay = ref(10)
const selectedId = ref('')
const month = ref(currentYearMonth())
const amount = ref('')
const status = ref<'paid' | 'pending'>('pending')
const message = ref('')
const localError = ref('')

const history = computed(() => entries.value.filter((entry) => entry.billId === selectedId.value)
  .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth)))
const current = computed(() => history.value.find((entry) => entry.yearMonth === month.value))
const previous = computed(() => getPreviousEntry(entries.value, selectedId.value, month.value))

watch(bills, (items) => {
  if (!items.some((item) => item.id === selectedId.value)) selectedId.value = items[0]?.id ?? ''
}, { immediate: true })

watch([selectedId, month, current], () => {
  amount.value = current.value ? formatBRL(current.value.amountCents) : ''
  status.value = current.value?.status ?? 'pending'
  localError.value = ''
}, { immediate: true })

function create(): void {
  message.value = ''
  const id = addBill(name.value, Number(dueDay.value))
  if (id) {
    selectedId.value = id
    name.value = ''
    dueDay.value = 10
    message.value = 'Conta cadastrada.'
  }
}

function record(): void {
  localError.value = ''
  message.value = ''
  try {
    if (saveEntry(selectedId.value, month.value, parseBRLToCents(amount.value), status.value)) {
      message.value = 'Valor mensal salvo com sucesso.'
    }
  } catch (cause) {
    localError.value = cause instanceof Error ? cause.message : 'Valor inválido.'
  }
}

function removeMonthlyEntry(entry: MonthlyBillEntry): void {
  const billName = bills.value.find((bill) => bill.id === entry.billId)?.name ?? 'Esta conta'
  const confirmed = window.confirm(
    `Excluir o registro de "${billName}" de ${formatYearMonth(entry.yearMonth)} (${formatBRL(entry.amountCents)})?\n\nSomente este mês será excluído. Os demais meses e o cadastro da conta permanecerão.`
  )
  if (!confirmed) return
  message.value = ''
  localError.value = ''
  if (deleteEntry(entry.id)) {
    message.value = 'Registro mensal excluído. Os demais meses foram preservados.'
  }
}

function compare(a: number, b: number): string {
  const delta = changePercentage(a, b)
  return delta === null ? '—' : (delta > 0 ? '+' : '') + delta.toFixed(1).replace('.', ',') + '%'
}
</script>

<template>
  <div class="heading">
    <div>
      <p class="eyebrow">VALORES QUE VARIAM</p>
      <h1>Contas mensais</h1>
      <p>Para água, luz e outras contas cujo valor muda. Registre cada mês e acompanhe o histórico.</p>
    </div>
  </div>

  <div class="columns">
    <section class="panel">
      <div class="panel-title"><h2>Minhas contas mensais</h2><b>{{ bills.length }}</b></div>
      <form class="form" @submit.prevent="create">
        <label>Nome da conta<input v-model="name" required minlength="2" maxlength="80" placeholder="Ex.: Energia elétrica" /></label>
        <label>Dia de vencimento<input v-model.number="dueDay" type="number" min="1" max="31" required /></label>
        <button type="submit" class="dark">+ Cadastrar conta</button>
      </form>
      <div class="bill-list">
        <button v-for="bill in bills" :key="bill.id" type="button" :class="{ selected: selectedId === bill.id }" @click="selectedId = bill.id">
          <b>{{ bill.name }}</b><small>Vence dia {{ bill.dueDay }}</small>
        </button>
        <p v-if="!bills.length">Nenhuma conta cadastrada.</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title"><h2>Registrar valor do mês</h2></div>
      <form class="form" @submit.prevent="record">
        <label>Conta
          <select v-model="selectedId" :disabled="!bills.length" required>
            <option disabled value="">Selecione</option>
            <option v-for="bill in bills" :key="bill.id" :value="bill.id">{{ bill.name }}</option>
          </select>
        </label>
        <label>Mês de referência<input type="month" v-model="month" required /></label>
        <label>Valor (R$)<MoneyInput v-model="amount" required placeholder="R$ 210,50" :disabled="!selectedId" /></label>
        <label>Situação
          <select v-model="status"><option value="pending">Pendente</option><option value="paid">Pago</option></select>
        </label>
        <button type="submit" class="primary" :disabled="!selectedId">{{ current ? 'Atualizar registro' : 'Registrar valor' }}</button>
      </form>
      <p v-if="message" class="success" role="status">{{ message }}</p>
      <p v-if="error || localError" class="error" role="alert">{{ localError || error }}</p>
      <div v-if="current && previous" class="comparison">
        <span>Comparação com {{ formatYearMonth(previous.yearMonth) }}</span>
        <strong>{{ formatBRL(Math.abs(current.amountCents - previous.amountCents)) }}</strong>
        <b :class="current.amountCents > previous.amountCents ? 'up' : 'down'">{{ compare(current.amountCents, previous.amountCents) }}</b>
      </div>
    </section>
  </div>

  <section class="panel history">
    <div class="panel-title">
      <div><h2>Histórico mensal</h2><p>Um registro incorreto pode ser excluído sem apagar os outros meses.</p></div>
    </div>
    <div v-if="!history.length" class="empty">Cadastre o primeiro valor para começar o histórico.</div>
    <div v-else class="scroll">
      <table>
        <thead><tr><th>Mês</th><th>Situação</th><th>Valor</th><th>Variação</th><th>Ações</th></tr></thead>
        <tbody>
          <tr v-for="(entry, index) in history" :key="entry.id">
            <td>{{ formatYearMonth(entry.yearMonth) }}</td>
            <td>{{ entry.status === 'paid' ? 'Pago' : 'Pendente' }}</td>
            <td>{{ formatBRL(entry.amountCents) }}</td>
            <td :class="index < history.length - 1 && entry.amountCents > history[index + 1].amountCents ? 'up' : 'down'">
              {{ index < history.length - 1 ? compare(entry.amountCents, history[index + 1].amountCents) : '—' }}
            </td>
            <td>
              <button type="button" class="danger-icon-button" :aria-label="'Excluir registro de ' + formatYearMonth(entry.yearMonth)" :title="'Excluir somente ' + formatYearMonth(entry.yearMonth)" @click="removeMonthlyEntry(entry)">
                <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6m4-6v6"/>
                </svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
