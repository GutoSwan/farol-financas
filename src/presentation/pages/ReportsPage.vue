<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBills } from '../composables/useBills'
import { useTransactions } from '../composables/useTransactions'
import { useFixedExpenses } from '../composables/useFixedExpenses'
import { expenseOverviewForMonth } from '../../domain/services/expenseOverview'
import { expensesByCategory, transactionSummary, transactionsInMonth } from '../../domain/services/transactionAnalytics'
import { formatBRL } from '../../domain/value-objects/Money'
import { currentYearMonth, formatYearMonth } from '../../shared/date'

const { entries, error: billError } = useBills()
const { transactions, error: transactionError } = useTransactions()
const { fixedExpenses, error: fixedError } = useFixedExpenses()
const month = ref(currentYearMonth())
const monthCount = ref(6)
const typeFilter = ref<'all' | 'recurring' | 'fixed' | 'oneoff'>('all')
const categoryFilter = ref('all')

const monthly = computed(() => expenseOverviewForMonth(entries.value, transactions.value, month.value, fixedExpenses.value))
const income = computed(() => transactionSummary(transactionsInMonth(transactions.value, month.value)).incomeCents)
const net = computed(() => income.value - monthly.value.totalCents)
const pending = computed(() => monthly.value.pendingRecurringCents + monthly.value.fixedPendingCents)

const breakdown = computed(() => [
  { title: 'Contas mensais', value: monthly.value.recurringCents, color: '#a6536a' },
  { title: 'Gastos fixos', value: monthly.value.fixedCents, color: '#7f91aa' },
  { title: 'Despesas avulsas', value: monthly.value.oneOffCents, color: '#ce8b9c' },
])
const donutStyle = computed(() => {
  const total = monthly.value.totalCents
  if (!total) return { background: 'conic-gradient(#65758a 0% 100%)' }
  let offset = 0
  const segments = breakdown.value.map((part) => {
    const start = offset
    offset += part.value / total * 100
    return `${part.color} ${start}% ${offset}%`
  })
  return { background: `conic-gradient(${segments.join(', ')})` }
})
const chartData = computed(() => {
  const [year, selected] = month.value.split('-').map(Number)
  return Array.from({ length: monthCount.value }, (_, index) => {
    const date = new Date(year, selected - 1 - (monthCount.value - 1 - index), 1)
    const period = currentYearMonth(date)
    return {
      period,
      label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''),
      value: expenseOverviewForMonth(entries.value, transactions.value, period, fixedExpenses.value),
    }
  })
})
function filteredAmount(result: ReturnType<typeof expenseOverviewForMonth>): number {
  switch (typeFilter.value) {
    case 'recurring': return result.recurringCents
    case 'fixed': return result.fixedCents
    case 'oneoff': return result.oneOffCents
    default: return result.totalCents
  }
}
const maxTotal = computed(() => Math.max(1, ...chartData.value.map((item) => filteredAmount(item.value))))
const categories = computed(() => expensesByCategory(transactionsInMonth(transactions.value, month.value)))
const visibleCategories = computed(() => categoryFilter.value === 'all'
  ? categories.value : categories.value.filter((item) => item.category === categoryFilter.value))
const categoryMax = computed(() => Math.max(1, ...visibleCategories.value.map((item) => item.amountCents)))
</script>

<template>
  <div class="heading">
    <div><p class="eyebrow">ANÁLISE FINANCEIRA</p><h1>Relatórios</h1>
      <p>Compare meses, entenda as despesas e acompanhe quanto pode sobrar.</p></div>
    <label>Mês de referência <input v-model="month" type="month" /></label>
  </div>
  <div class="notice">Gastos totais incluem contas pendentes e valores fixos previstos. O cálculo de sobra só usa receitas que você registrou e não é saldo bancário.</div>
  <p v-if="billError || transactionError || fixedError" class="error" role="alert">{{ billError || transactionError || fixedError }}</p>

  <div class="finance-flow">
    <section class="panel">
      <div class="panel-title"><div><h2>Resumo de {{ formatYearMonth(month) }}</h2><p>Veja receitas, despesas e valores pendentes em um só lugar.</p></div></div>
      <div class="report-metrics">
        <div class="report-metric"><span>Gastos registrados</span><strong class="expense-text">{{ formatBRL(monthly.totalCents) }}</strong></div>
        <div class="report-metric"><span>Receitas informadas</span><strong class="positive-text">{{ formatBRL(income) }}</strong></div>
        <div class="report-metric"><span>{{ net >= 0 ? 'Sobra estimada' : 'Diferença negativa' }}</span>
          <strong v-if="income > 0" :class="net >= 0 ? 'positive-text' : 'expense-text'">{{ net < 0 ? '−' : '' }}{{ formatBRL(Math.abs(net)) }}</strong>
          <strong v-else class="muted-value">Sem receitas</strong>
        </div>
        <div class="report-metric"><span>Contas pendentes</span><strong class="expense-text">{{ formatBRL(pending) }}</strong></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <div><h2>Quanto gastou em cada mês?</h2><p>Uma barra representa o total de gastos de um mês. Quanto maior, maior a despesa.</p></div>
        <div class="report-filters">
          <label class="period-select">Tipo
            <select v-model="typeFilter">
              <option value="all">Gastos totais</option><option value="recurring">Contas mensais</option>
              <option value="fixed">Gastos fixos</option><option value="oneoff">Despesas avulsas</option>
            </select>
          </label>
          <label class="period-select">Período
            <select v-model.number="monthCount"><option :value="6">6 meses</option><option :value="12">12 meses</option></select>
          </label>
        </div>
      </div>
      <div class="simple-chart-scroll">
        <div class="simple-chart" :style="{ gridTemplateColumns: 'repeat(' + monthCount + ', minmax(90px, 1fr))' }"
          role="img" :aria-label="'Gastos por mês no filtro escolhido: ' + chartData.map((item) => formatYearMonth(item.period) + ' ' + formatBRL(filteredAmount(item.value))).join('; ')">
          <div v-for="item in chartData" :key="item.period" class="simple-chart-column" :class="{ current: item.period === month }">
            <strong>{{ formatBRL(filteredAmount(item.value)) }}</strong>
            <div class="simple-chart-background">
              <div class="simple-chart-bar" :style="{ height: (filteredAmount(item.value) / maxTotal * 100) + '%' }"></div>
            </div>
            <span>{{ item.label }}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title"><div><h2>Onde estão os gastos do mês?</h2><p>Divisão entre contas mensais, gastos fixos e compras avulsas.</p></div></div>
      <div class="report-donut-layout">
        <div class="report-donut" :style="donutStyle" role="img"
          :aria-label="breakdown.map((part) => part.title + ': ' + formatBRL(part.value)).join('; ')">
          <div class="report-donut-center"><small>Total do mês</small><strong>{{ formatBRL(monthly.totalCents) }}</strong></div>
        </div>
        <div class="report-donut-legend">
          <div v-for="part in breakdown" :key="part.title" class="report-legend-row">
            <span class="report-legend-name"><i :style="{ background: part.color }"></i>{{ part.title }}</span>
            <div><strong>{{ formatBRL(part.value) }}</strong><small>{{ monthly.totalCents ? (part.value / monthly.totalCents * 100).toFixed(1).replace('.', ',') : '0' }}%</small></div>
          </div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <div><h2>Compras por categoria</h2><p>Apenas despesas cadastradas em Lançamentos.</p></div>
        <label class="period-select">Categoria
          <select v-model="categoryFilter">
            <option value="all">Todas</option>
            <option v-for="item in categories" :key="item.category" :value="item.category">{{ item.category }}</option>
          </select>
        </label>
      </div>
      <div v-if="!visibleCategories.length" class="empty">Nenhuma compra avulsa neste mês ou categoria.</div>
      <div v-else class="category-chart">
        <div v-for="part in visibleCategories" :key="part.category" class="category-chart-row">
          <div class="chart-row-heading"><span>{{ part.category }}</span><strong>{{ formatBRL(part.amountCents) }}</strong></div>
          <div class="chart-track"><div class="chart-fill" :style="{ width: (part.amountCents / categoryMax * 100) + '%' }"></div></div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title"><div><h2>Tabela mensal comparativa</h2><p>Valores por origem, sem ocultar os totais.</p></div></div>
      <div class="scroll"><table>
        <thead><tr><th>Mês</th><th>Contas mensais</th><th>Gastos fixos</th><th>Compras</th><th>Total</th></tr></thead>
        <tbody><tr v-for="item in [...chartData].reverse()" :key="item.period">
          <td>{{ formatYearMonth(item.period) }}</td>
          <td>{{ formatBRL(item.value.recurringCents) }}</td>
          <td>{{ formatBRL(item.value.fixedCents) }}</td>
          <td>{{ formatBRL(item.value.oneOffCents) }}</td>
          <td><strong class="expense-text">{{ formatBRL(item.value.totalCents) }}</strong></td>
        </tr></tbody>
      </table></div>
    </section>
  </div>
</template>
