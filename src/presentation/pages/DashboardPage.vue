<script setup lang="ts">
import { computed, ref } from 'vue'
import StatCard from '../components/StatCard.vue'
import { useBills } from '../composables/useBills'
import { useTransactions } from '../composables/useTransactions'
import { useFixedExpenses } from '../composables/useFixedExpenses'
import { expenseOverviewForMonth } from '../../domain/services/expenseOverview'
import { transactionSummary, transactionsInMonth } from '../../domain/services/transactionAnalytics'
import { fixedExpensesForMonth } from '../../domain/services/fixedExpenseAnalytics'
import { formatBRL } from '../../domain/value-objects/Money'
import { currentYearMonth, formatYearMonth } from '../../shared/date'

const { bills, entries, error: billError } = useBills()
const { transactions, error: transactionError } = useTransactions()
const { fixedExpenses, error: fixedError } = useFixedExpenses()
const month = ref(currentYearMonth())

const overview = computed(() => expenseOverviewForMonth(
  entries.value, transactions.value, month.value, fixedExpenses.value,
))
const income = computed(() => transactionSummary(transactionsInMonth(transactions.value, month.value)).incomeCents)
const surplus = computed(() => income.value - overview.value.totalCents)
const pendingBills = computed(() => entries.value
  .filter((entry) => entry.yearMonth === month.value && entry.status === 'pending')
  .map((entry) => ({
    id: 'bill-' + entry.id,
    name: bills.value.find((bill) => bill.id === entry.billId)?.name ?? 'Conta mensal',
    dueDay: bills.value.find((bill) => bill.id === entry.billId)?.dueDay ?? 31,
    amountCents: entry.amountCents,
    source: 'Conta mensal',
  })))
const pendingFixed = computed(() => fixedExpensesForMonth(fixedExpenses.value, month.value)
  .filter((item) => !item.paidMonths.includes(month.value))
  .map((item) => ({
    id: 'fixed-' + item.id,
    name: item.name,
    dueDay: item.dueDay,
    amountCents: item.amountCents,
    source: 'Gasto fixo',
  })))
const pending = computed(() => [...pendingBills.value, ...pendingFixed.value]
  .sort((a, b) => a.dueDay - b.dueDay).slice(0, 8))
</script>

<template>
  <div class="heading">
    <div>
      <p class="eyebrow">VISÃO GERAL</p>
      <h1>Seu painel financeiro</h1>
      <p>Um resumo rápido para você saber como está o mês.</p>
    </div>
    <label>Mês de referência <input v-model="month" type="month" /></label>
  </div>

  <p v-if="billError || transactionError || fixedError" class="error" role="alert">{{ billError || transactionError || fixedError }}</p>
  <section class="panel dashboard-summary">
    <div class="panel-title">
      <div><h2>Gastos totais de {{ formatYearMonth(month) }}</h2><p>Contas mensais, gastos fixos e despesas avulsas cadastrados</p></div>
      <RouterLink class="secondary-action" to="/relatorios">Ver relatório completo</RouterLink>
    </div>
    <div class="dashboard-primary-total">
      <span>Total de despesas e compromissos no mês</span>
      <strong class="expense-text">{{ formatBRL(overview.totalCents) }}</strong>
      <small>Inclui {{ formatBRL(overview.pendingRecurringCents + overview.fixedPendingCents) }} de contas pendentes. Não representa saldo bancário nem valor já pago.</small>
    </div>
  </section>

  <div class="dashboard-breakdown">
    <StatCard label="Contas mensais" :value="formatBRL(overview.recurringCents)" hint="Registradas no mês" tone="expense" />
    <StatCard label="Gastos fixos" :value="formatBRL(overview.fixedCents)" hint="Recorrências previstas" tone="expense" />
    <StatCard label="Despesas avulsas" :value="formatBRL(overview.oneOffCents)" hint="Compras e outros lançamentos" tone="expense" />
  </div>
  <section class="panel income-overview">
    <div class="panel-title">
      <div><h2>O que pode sobrar?</h2><p>Receitas registradas menos gastos e compromissos do mês.</p></div>
    </div>
    <div class="income-summary">
      <div><span>Receitas registradas</span><strong class="positive-text">{{ formatBRL(income) }}</strong></div>
      <div v-if="income > 0"><span>{{ surplus >= 0 ? 'Sobra estimada' : 'Diferença negativa' }}</span>
        <strong :class="surplus >= 0 ? 'positive-text' : 'expense-text'">{{ surplus < 0 ? '−' : '' }}{{ formatBRL(Math.abs(surplus)) }}</strong>
      </div>
      <div v-else><span>Sobra estimada</span><strong class="muted-value">Informe suas receitas</strong></div>
    </div>
    <p class="dashboard-footnote">Estimativa baseada somente nos valores cadastrados. Não representa seu saldo disponível no banco.</p>
  </section>

  <section class="panel history">
    <div class="panel-title">
      <div><h2>Contas que faltam pagar</h2><p>Cobranças cadastradas e marcadas como pendentes em {{ formatYearMonth(month) }}</p></div>
    </div>
    <p v-if="!pending.length" class="empty">Nenhuma cobrança pendente cadastrada para este mês.</p>
    <div v-else class="scroll">
      <table>
        <thead><tr><th>Descrição</th><th>Origem</th><th>Vencimento</th><th>Valor</th></tr></thead>
        <tbody>
          <tr v-for="item in pending" :key="item.id">
            <td>{{ item.name }}</td>
            <td>{{ item.source }}</td>
            <td>Dia {{ item.dueDay }}</td>
            <td><strong class="expense-text">{{ formatBRL(item.amountCents) }}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <div class="dashboard-shortcuts">
    <RouterLink class="primary" to="/lancamentos">+ Novo lançamento</RouterLink>
    <RouterLink class="secondary-action" to="/contas-mensais">Contas mensais</RouterLink>
    <RouterLink class="secondary-action" to="/gastos-fixos">Gastos fixos</RouterLink>
    <RouterLink class="secondary-action" to="/relatorios">Analisar gráficos</RouterLink>
  </div>
  <p class="dashboard-footnote">Evite registrar a mesma cobrança em mais de um módulo. Pagamentos de gastos fixos apenas mudam o status e não geram novas despesas.</p>
</template>
