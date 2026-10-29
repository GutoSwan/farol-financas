<script setup lang="ts">
import { ref, computed } from 'vue'
import StatCard from '../components/StatCard.vue'
import { useBills } from '../composables/useBills'
import { useTransactions } from '../composables/useTransactions'
import { formatBRL } from '../../domain/value-objects/Money'
import { totalForMonth, paidForMonth } from '../../domain/services/billAnalytics'
import { expensesByCategory, transactionsInMonth, transactionSummary } from '../../domain/services/transactionAnalytics'
import { currentYearMonth, formatYearMonth } from '../../shared/date'

const { bills, entries, error: billError } = useBills()
const { transactions, error: transactionError } = useTransactions()
const month = ref(currentYearMonth())
const visibleBills = computed(() => entries.value.filter((entry) => entry.yearMonth === month.value))
const totalBills = computed(() => totalForMonth(entries.value, month.value))
const paidBills = computed(() => paidForMonth(entries.value, month.value))
const monthTransactions = computed(() => transactionsInMonth(transactions.value, month.value))
const transactionTotals = computed(() => transactionSummary(monthTransactions.value))
const categories = computed(() => expensesByCategory(monthTransactions.value))
const maxCategory = computed(() => Math.max(1, ...categories.value.map((item) => item.amountCents)))
</script>

<template>
  <div class="heading">
    <div>
      <p class="eyebrow">VISÃO GERAL</p>
      <h1>Seu painel financeiro</h1>
      <p>Acompanhe suas contas e compras do dia a dia.</p>
    </div>
    <label>Mês de referência <input v-model="month" type="month" /></label>
  </div>
  <div class="notice">
    Os resumos abaixo são separados por tipo. Ainda não representam o saldo bancário nem incluem despesas de cartão de crédito.
  </div>
  <p v-if="billError || transactionError" class="error" role="alert">{{ billError || transactionError }}</p>

  <div class="panel-title"><h2>Contas mensais</h2><RouterLink to="/contas-mensais" class="primary">Gerenciar contas</RouterLink></div>
  <div class="stats">
    <StatCard label="Contas registradas" :value="String(visibleBills.length)" hint="Valores informados no mês" />
    <StatCard label="Total informado" :value="formatBRL(totalBills)" hint="Pago e pendente" />
    <StatCard label="Total pago" :value="formatBRL(paidBills)" hint="Marcado como pago" />
    <StatCard label="Ainda pendente" :value="formatBRL(totalBills - paidBills)" hint="Do que foi registrado" />
  </div>

  <div class="panel-title"><h2>Compras e outros lançamentos</h2><RouterLink to="/lancamentos" class="primary">+ Novo lançamento</RouterLink></div>
  <div class="transaction-stats dashboard-transactions">
    <StatCard label="Compras e despesas avulsas" :value="formatBRL(transactionTotals.expensesCents)" hint="Gastos registrados no mês" />
    <StatCard label="Receitas avulsas" :value="formatBRL(transactionTotals.incomeCents)" hint="Entradas registradas no mês" />
    <StatCard label="Total de lançamentos" :value="String(monthTransactions.length)" hint="Registros neste mês" />
  </div>
  <section class="panel">
    <div class="panel-title"><div><h2>Gastos por categoria</h2><p>Gráfico de {{ formatYearMonth(month) }}</p></div></div>
    <p v-if="!categories.length" class="empty">Adicione uma compra em Lançamentos para começar a visualizar os gastos.</p>
    <div v-else class="category-chart" role="img" :aria-label="'Gastos por categoria: ' + categories.map((item) => item.category + ' ' + formatBRL(item.amountCents)).join(', ')">
      <div v-for="item in categories" :key="item.category" class="category-chart-row">
        <div class="chart-row-heading"><span>{{ item.category }}</span><strong>{{ formatBRL(item.amountCents) }}</strong></div>
        <div class="chart-track"><div class="chart-fill" :style="{ width: (item.amountCents / maxCategory * 100) + '%' }"></div></div>
      </div>
    </div>
  </section>

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
