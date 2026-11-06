<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useBills } from '../composables/useBills'
import { useFixedExpenses } from '../composables/useFixedExpenses'
import { useTransactions } from '../composables/useTransactions'
import { monthlyExpenseDetails } from '../../domain/services/monthlyExpenseDetails'
import type { MonthlyExpenseType, ExpenseStatus } from '../../domain/services/monthlyExpenseDetails'
import { validMonth } from '../../domain/services/fixedExpenseAnalytics'
import { formatBRL } from '../../domain/value-objects/Money'
import { formatYearMonth } from '../../shared/date'

const route = useRoute()
const { bills, entries, error: billError } = useBills()
const { fixedExpenses, error: fixedError } = useFixedExpenses()
const { transactions, error: transactionError } = useTransactions()

const filters: { value: MonthlyExpenseType; label: string }[] = [
  { value: 'all', label: 'Todos os gastos' },
  { value: 'recurring', label: 'Contas mensais' },
  { value: 'fixed', label: 'Gastos fixos' },
  { value: 'oneoff', label: 'Despesas avulsas' },
]

const month = computed(() => {
  const value = route.query.mes
  // Só permitir meses conhecidos e válidos na URL.
  return typeof value === 'string' && validMonth(value) && Number(value.slice(0, 4)) >= 1900
    ? value : null
})
const type = computed<MonthlyExpenseType>(() => {
  const value = route.query.tipo
  return filters.some((filter) => filter.value === value) ? value as MonthlyExpenseType : 'all'
})
const sections = computed(() => month.value
  ? monthlyExpenseDetails(bills.value, entries.value, fixedExpenses.value, transactions.value, month.value)
  : [])
const visibleSections = computed(() => type.value === 'all'
  ? sections.value
  : sections.value.filter((section) => section.type === type.value))
const totalCents = computed(() => visibleSections.value.reduce((total, section) => total + section.totalCents, 0))
const count = computed(() => visibleSections.value.reduce((total, section) => total + section.items.length, 0))
const dataError = computed(() => billError.value || fixedError.value || transactionError.value)

function statusText(status: ExpenseStatus): string {
  if (status === 'paid') return 'Pago'
  if (status === 'pending') return 'Pendente / previsto'
  return 'Registrado'
}
</script>

<template>
  <div class="month-detail">
    <RouterLink class="month-detail-back" to="/relatorios">← Voltar aos relatórios</RouterLink>

    <div v-if="!month" class="panel">
      <h1>Mês inválido</h1>
      <p>Selecione um mês válido no gráfico de Relatórios para consultar o histórico.</p>
    </div>

    <template v-else>
      <div class="heading">
        <div>
          <p class="eyebrow">HISTÓRICO DE DESPESAS</p>
          <h1>Gastos de {{ formatYearMonth(month) }}</h1>
          <p>Itens que compõem a barra selecionada no gráfico de Relatórios.</p>
        </div>
      </div>
      <p class="notice">Este histórico usa os registros do espaço financeiro selecionado neste navegador. Inclui contas pendentes e gastos fixos previstos, mesmo que ainda não tenham sido pagos. Não é um extrato bancário nem uma cópia permanente dos valores.</p>
      <p v-if="dataError" class="error" role="alert">{{ dataError }}</p>

      <nav class="month-detail-filters" aria-label="Filtrar despesas do mês">
        <RouterLink v-for="filter in filters" :key="filter.value"
          :to="{ path: '/relatorios/detalhes', query: { mes: month, tipo: filter.value } }"
          :class="{ active: type === filter.value }"
          :aria-current="type === filter.value ? 'page' : undefined">
          {{ filter.label }}
        </RouterLink>
      </nav>

      <section class="panel month-detail-summary" aria-label="Resumo do mês">
        <div>
          <span>Gastos neste filtro</span>
          <strong class="expense-text">{{ formatBRL(totalCents) }}</strong>
          <small>{{ count }} {{ count === 1 ? 'registro' : 'registros' }} em {{ formatYearMonth(month) }}</small>
        </div>
      </section>

      <div class="finance-flow">
        <section v-for="section in visibleSections" :key="section.type" class="panel month-detail-section">
          <div class="panel-title month-detail-section-heading">
            <div><h2>{{ section.title }}</h2>
              <p>{{ section.items.length }} {{ section.items.length === 1 ? 'item' : 'itens' }} neste mês</p></div>
            <strong class="expense-text">{{ formatBRL(section.totalCents) }}</strong>
          </div>
          <div v-if="!section.items.length" class="empty">Nenhum gasto registrado nesta categoria para este mês.</div>
          <ul v-else class="month-detail-list">
            <li v-for="item in section.items" :key="section.type + ':' + item.id" class="month-detail-item">
              <div class="month-detail-item-name">
                <strong>{{ item.name }}</strong>
                <small>{{ item.description }}</small>
              </div>
              <span class="month-detail-status" :class="'status-' + item.status">{{ statusText(item.status) }}</span>
              <strong class="month-detail-amount">{{ formatBRL(item.amountCents) }}</strong>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>
