<script setup lang="ts">
import { ref, computed } from 'vue'
import StatCard from '../components/StatCard.vue'
import { useBills } from '../composables/useBills'
import { useTransactions } from '../composables/useTransactions'
import { formatBRL } from '../../domain/value-objects/Money'
import { totalForMonth, paidForMonth } from '../../domain/services/billAnalytics'
import { transactionsInMonth, transactionSummary } from '../../domain/services/transactionAnalytics'
import { expenseOverviewForMonth } from '../../domain/services/expenseOverview'
import { currentYearMonth, formatYearMonth } from '../../shared/date'

const { bills, entries, error: billError } = useBills()
const { transactions, error: transactionError } = useTransactions()
const month = ref(currentYearMonth())
const visibleBills = computed(() => entries.value.filter((entry) => entry.yearMonth === month.value))
const totalBills = computed(() => totalForMonth(entries.value, month.value))
const paidBills = computed(() => paidForMonth(entries.value, month.value))
const monthTransactions = computed(() => transactionsInMonth(transactions.value, month.value))
const transactionTotals = computed(() => transactionSummary(monthTransactions.value))

/** Soma contas recorrentes registradas (pagas e pendentes) com despesas avulsas. */
const overall = computed(() => expenseOverviewForMonth(entries.value, transactions.value, month.value))
const history = computed(() => {
  const [year, selectedMonth] = month.value.split('-').map(Number)
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(year, selectedMonth - 1 - (5 - index), 1)
    const yearMonth = currentYearMonth(date)
    return {
      yearMonth,
      label: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      summary: expenseOverviewForMonth(entries.value, transactions.value, yearMonth),
    }
  })
})
const maxTotal = computed(() => Math.max(1, ...history.value.map((item) => item.summary.totalCents)))
</script>

<template>
  <div class="heading">
    <div>
      <p class="eyebrow">VISÃO GERAL</p>
      <h1>Seu painel financeiro</h1>
      <p>Acompanhe contas mensais e compras do dia a dia em um só lugar.</p>
    </div>
    <label>Mês de referência <input v-model="month" type="month" /></label>
  </div>

  <div class="notice">
    Gastos totais incluem despesas avulsas e contas mensais registradas, mesmo quando pendentes.
    Não representam dinheiro já pago nem saldo bancário. Evite cadastrar uma conta duas vezes.
  </div>
  <p v-if="billError || transactionError" class="error" role="alert">{{ billError || transactionError }}</p>

  <section class="panel total-overview">
    <div class="panel-title">
      <div><h2>Gastos totais</h2><p>Contas mensais + compras e despesas avulsas</p></div>
    </div>
    <div class="total-overview-summary">
      <div class="total-overview-main">
        <span>Total registrado em {{ formatYearMonth(month) }}</span>
        <strong>{{ formatBRL(overall.totalCents) }}</strong>
        <small>Inclui {{ formatBRL(overall.pendingRecurringCents) }} de contas ainda pendentes.</small>
      </div>
      <div class="total-overview-detail">
        <span>Contas mensais</span>
        <strong>{{ formatBRL(overall.recurringCents) }}</strong>
      </div>
      <div class="total-overview-detail">
        <span>Gastos avulsos</span>
        <strong>{{ formatBRL(overall.oneOffCents) }}</strong>
      </div>
    </div>

    <div class="total-chart-heading">
      <h3>Evolução dos gastos totais</h3>
      <span>Últimos seis meses</span>
    </div>
    <div class="total-chart-legend">
      <span><i class="legend-recurring"></i> Contas mensais</span>
      <span><i class="legend-oneoff"></i> Despesas avulsas</span>
    </div>
    <div class="total-month-chart" role="img" :aria-label="'Evolução de gastos registrados: ' + history.map((item) => item.yearMonth + ': ' + formatBRL(item.summary.totalCents)).join(', ')">
      <div v-for="item in history" :key="item.yearMonth" class="total-month-column" :title="item.yearMonth + ': contas ' + formatBRL(item.summary.recurringCents) + ', avulsos ' + formatBRL(item.summary.oneOffCents)">
        <strong>{{ item.summary.totalCents ? formatBRL(item.summary.totalCents) : '—' }}</strong>
        <div class="total-month-track">
          <div class="total-month-stacked" :style="{ height: (item.summary.totalCents / maxTotal * 100) + '%' }">
            <div v-if="item.summary.recurringCents" class="total-month-recurring" :style="{ height: (item.summary.recurringCents / item.summary.totalCents * 100) + '%' }"></div>
            <div v-if="item.summary.oneOffCents" class="total-month-oneoff" :style="{ height: (item.summary.oneOffCents / item.summary.totalCents * 100) + '%' }"></div>
          </div>
        </div>
        <small>{{ item.label }}</small>
      </div>
    </div>
  </section>

  <div class="panel-title dashboard-subheading"><h2>Contas mensais</h2><RouterLink to="/contas-mensais" class="primary">Gerenciar contas</RouterLink></div>
  <div class="stats">
    <StatCard label="Contas registradas" :value="String(visibleBills.length)" hint="Valores informados no mês" />
    <StatCard label="Total informado" :value="formatBRL(totalBills)" hint="Pago e pendente" />
    <StatCard label="Total pago" :value="formatBRL(paidBills)" hint="Marcado como pago" />
    <StatCard label="Ainda pendente" :value="formatBRL(totalBills - paidBills)" hint="Do que foi registrado" />
  </div>

  <div class="panel-title dashboard-subheading"><h2>Compras e outros lançamentos</h2><RouterLink to="/lancamentos" class="primary">+ Novo lançamento</RouterLink></div>
  <div class="transaction-stats dashboard-transactions">
    <StatCard label="Compras e despesas avulsas" :value="formatBRL(transactionTotals.expensesCents)" hint="Gastos registrados no mês" />
    <StatCard label="Receitas avulsas" :value="formatBRL(transactionTotals.incomeCents)" hint="Entradas registradas no mês" />
    <StatCard label="Total de lançamentos" :value="String(monthTransactions.length)" hint="Registros neste mês" />
  </div>

  <section class="panel history">
    <div class="panel-title"><div><h2>Contas de {{ formatYearMonth(month) }}</h2><p>Histórico dos valores recorrentes</p></div></div>
    <div v-if="!visibleBills.length" class="empty">Nenhuma conta recorrente registrada neste mês.</div>
    <div v-else class="scroll">
      <table>
        <thead><tr><th>Conta</th><th>Vencimento</th><th>Situação</th><th>Valor</th></tr></thead>
        <tbody>
          <tr v-for="entry in visibleBills" :key="entry.id">
            <td>{{ bills.find((bill) => bill.id === entry.billId)?.name ?? 'Conta' }}</td>
            <td>Dia {{ bills.find((bill) => bill.id === entry.billId)?.dueDay ?? '—' }}</td>
            <td>{{ entry.status === 'paid' ? 'Pago' : 'Pendente' }}</td>
            <td>{{ formatBRL(entry.amountCents) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
