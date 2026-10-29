<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBills } from '../composables/useBills'
import { useTransactions } from '../composables/useTransactions'
import { useFixedExpenses } from '../composables/useFixedExpenses'
import { expenseOverviewForMonth } from '../../domain/services/expenseOverview'
import { fixedExpensesForMonth } from '../../domain/services/fixedExpenseAnalytics'
import { expensesByCategory, transactionSummary, transactionsInMonth } from '../../domain/services/transactionAnalytics'
import { formatBRL } from '../../domain/value-objects/Money'
import { currentYearMonth, formatYearMonth } from '../../shared/date'

const { entries, error: billError } = useBills()
const { transactions, error: transactionError } = useTransactions()
const { fixedExpenses, error: fixedError } = useFixedExpenses()
const month = ref(currentYearMonth())

const monthly = computed(() => expenseOverviewForMonth(entries.value, transactions.value, month.value, fixedExpenses.value))
const monthlyIncome = computed(() => transactionSummary(transactionsInMonth(transactions.value, month.value)).incomeCents)
const breakdown = computed(() => [
  { title: 'Contas mensais', value: monthly.value.recurringCents, className: 'report-recurring' },
  { title: 'Gastos fixos', value: monthly.value.fixedCents, className: 'report-fixed' },
  { title: 'Despesas avulsas', value: monthly.value.oneOffCents, className: 'report-oneoff' },
])
const timeline = computed(() => {
  const [year, monthNumber] = month.value.split('-').map(Number)
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(year, monthNumber - 1 - (11 - index), 1)
    const period = currentYearMonth(date)
    return {
      month: period,
      label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''),
      result: expenseOverviewForMonth(entries.value, transactions.value, period, fixedExpenses.value),
    }
  })
})
const maxValue = computed(() => Math.max(1, ...timeline.value.map((item) => item.result.totalCents)))
const categories = computed(() => expensesByCategory(transactionsInMonth(transactions.value, month.value)))
const categoryMax = computed(() => Math.max(1, ...categories.value.map((item) => item.amountCents)))
const fixedCount = computed(() => fixedExpensesForMonth(fixedExpenses.value, month.value).length)
</script>

<template>
  <div class="heading">
    <div>
      <p class="eyebrow">ANÁLISE FINANCEIRA</p>
      <h1>Relatórios</h1>
      <p>Veja a evolução dos gastos, compare os meses e descubra para onde vai o orçamento.</p>
    </div>
    <label>Mês de referência <input v-model="month" type="month" /></label>
  </div>
  <div class="notice">
    O total inclui contas mensais registradas, gastos fixos previstos e despesas avulsas.
    Contas pendentes também entram. Receitas não reduzem os gastos exibidos.
  </div>
  <p v-if="billError || transactionError || fixedError" class="error" role="alert">{{ billError || transactionError || fixedError }}</p>

  <div class="transaction-stats">
    <article class="stat"><span>Gastos totais no mês</span><strong>{{ formatBRL(monthly.totalCents) }}</strong><small>Despesas e compromissos registrados</small></article>
    <article class="stat"><span>Receitas avulsas no mês</span><strong class="down">{{ formatBRL(monthlyIncome) }}</strong><small>Entradas informadas em Lançamentos</small></article>
    <article class="stat"><span>Contas pendentes</span><strong class="up">{{ formatBRL(monthly.pendingRecurringCents + monthly.fixedPendingCents) }}</strong><small>Contas mensais e {{ fixedCount }} gasto(s) fixo(s) ativo(s)</small></article>
  </div>

  <section class="panel">
    <div class="panel-title">
      <div><h2>Evolução geral dos gastos</h2><p>Últimos 12 meses até {{ formatYearMonth(month) }} · valores em reais</p></div>
    </div>
    <div class="total-chart-legend">
      <span><i class="legend-recurring"></i> Contas mensais</span>
      <span><i class="legend-fixed"></i> Gastos fixos</span>
      <span><i class="legend-oneoff"></i> Gastos avulsos</span>
    </div>
    <div class="report-timeline-scroll">
      <div class="report-timeline" role="img" :aria-label="'Evolução mensal: ' + timeline.map((item) => item.month + ' ' + formatBRL(item.result.totalCents)).join(', ')">
        <div v-for="item in timeline" :key="item.month" class="report-timeline-item" :title="item.month + ': ' + formatBRL(item.result.totalCents)">
          <strong>{{ item.result.totalCents ? formatBRL(item.result.totalCents) : '—' }}</strong>
          <div class="report-timeline-track">
            <div class="report-timeline-stacked" :style="{ height: (item.result.totalCents / maxValue * 100) + '%' }">
              <div v-if="item.result.recurringCents" class="report-recurring" :style="{ height: (item.result.recurringCents / item.result.totalCents * 100) + '%' }"></div>
              <div v-if="item.result.fixedCents" class="report-fixed" :style="{ height: (item.result.fixedCents / item.result.totalCents * 100) + '%' }"></div>
              <div v-if="item.result.oneOffCents" class="report-oneoff" :style="{ height: (item.result.oneOffCents / item.result.totalCents * 100) + '%' }"></div>
            </div>
          </div>
          <small>{{ item.label }}</small>
        </div>
      </div>
    </div>
  </section>

  <div class="transaction-charts history">
    <section class="panel">
      <div class="panel-title"><div><h2>Composição do mês</h2><p>Quanto cada tipo de despesa representa</p></div></div>
      <div class="category-chart">
        <div v-for="part in breakdown" :key="part.title" class="category-chart-row">
          <div class="chart-row-heading"><span>{{ part.title }}</span><strong>{{ formatBRL(part.value) }}</strong></div>
          <div class="chart-track">
            <div :class="['chart-fill', part.className]" :style="{ width: (part.value / Math.max(1, monthly.totalCents) * 100) + '%' }"></div>
          </div>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-title"><div><h2>Despesas avulsas por categoria</h2><p>Categorias dos lançamentos de {{ formatYearMonth(month) }}</p></div></div>
      <p v-if="!categories.length" class="empty">Nenhuma despesa avulsa cadastrada neste mês.</p>
      <div v-else class="category-chart">
        <div v-for="item in categories" :key="item.category" class="category-chart-row">
          <div class="chart-row-heading"><span>{{ item.category }}</span><strong>{{ formatBRL(item.amountCents) }}</strong></div>
          <div class="chart-track"><div class="chart-fill" :style="{ width: (item.amountCents / categoryMax * 100) + '%' }"></div></div>
        </div>
      </div>
    </section>
  </div>

  <section class="panel history">
    <div class="panel-title"><div><h2>Resumo comparativo</h2><p>Informações que alimentam o gráfico geral.</p></div></div>
    <div class="scroll">
      <table>
        <thead><tr><th>Mês</th><th>Contas mensais</th><th>Gastos fixos</th><th>Gastos avulsos</th><th>Total</th></tr></thead>
        <tbody>
          <tr v-for="item in [...timeline].reverse()" :key="item.month">
            <td>{{ formatYearMonth(item.month) }}</td>
            <td>{{ formatBRL(item.result.recurringCents) }}</td>
            <td>{{ formatBRL(item.result.fixedCents) }}</td>
            <td>{{ formatBRL(item.result.oneOffCents) }}</td>
            <td><strong>{{ formatBRL(item.result.totalCents) }}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
