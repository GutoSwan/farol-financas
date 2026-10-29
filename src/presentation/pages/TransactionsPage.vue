<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTransactions } from '../composables/useTransactions'
import { activeWorkspaceId } from '../composables/useWorkspaces'
import { TRANSACTION_CATEGORIES } from '../../domain/entities/Transaction'
import MoneyInput from '../components/MoneyInput.vue'
import UiIcon from '../components/UiIcon.vue'
import type { TransactionCategory, TransactionKind, Transaction } from '../../domain/entities/Transaction'
import { parseBRLToCents, formatBRL } from '../../domain/value-objects/Money'
import { expensesByCategory, transactionsInMonth, transactionSummary } from '../../domain/services/transactionAnalytics'
import { currentYearMonth, formatYearMonth } from '../../shared/date'

function today(): string {
  const date = new Date()
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

const { transactions, error, upsert, remove } = useTransactions()
const month = ref(currentYearMonth())
const description = ref('')
const amount = ref('')
const category = ref<TransactionCategory>('Mercado')
const kind = ref<TransactionKind>('expense')
const occurredOn = ref(today())
const editingId = ref<string | null>(null)
const feedback = ref('')
const formError = ref('')

const visible = computed(() => transactionsInMonth(transactions.value, month.value))
const summary = computed(() => transactionSummary(visible.value))
const categories = computed(() => expensesByCategory(visible.value))
const highest = computed(() => Math.max(1, ...categories.value.map((item) => item.amountCents)))
const categorySuggestions = computed(() => Array.from(new Set([...TRANSACTION_CATEGORIES, ...transactions.value.map((item) => item.category)])))
const previousMonths = computed(() => {
  const [year, selectedMonth] = month.value.split('-').map(Number)
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(year, selectedMonth - 1 - (5 - index), 1)
    const yearMonth = currentYearMonth(date)
    const data = transactionSummary(transactionsInMonth(transactions.value, yearMonth))
    return { yearMonth, name: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), expense: data.expensesCents }
  })
})
const monthlyMax = computed(() => Math.max(1, ...previousMonths.value.map((item) => item.expense)))

function resetForm(): void {
  editingId.value = null
  description.value = ''
  amount.value = ''
  category.value = 'Mercado'
  kind.value = 'expense'
  occurredOn.value = today()
  formError.value = ''
}

function submit(): void {
  formError.value = ''
  feedback.value = ''
  try {
    const ok = upsert({
      id: editingId.value ?? undefined,
      description: description.value,
      amountCents: parseBRLToCents(amount.value),
      category: category.value,
      kind: kind.value,
      occurredOn: occurredOn.value,
    })
    if (ok) {
      feedback.value = editingId.value ? 'Lançamento atualizado.' : 'Lançamento adicionado.'
      resetForm()
    }
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : 'Confira o valor informado.'
  }
}

function edit(item: Transaction): void {
  editingId.value = item.id
  description.value = item.description
  amount.value = formatBRL(item.amountCents)
  category.value = item.category
  kind.value = item.kind
  occurredOn.value = item.occurredOn
  feedback.value = ''
  formError.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function deleteTransaction(item: Transaction): void {
  if (!window.confirm(`Excluir "${item.description}" (${formatBRL(item.amountCents)})?`)) return
  feedback.value = ''
  if (remove(item.id)) {
    if (editingId.value === item.id) resetForm()
    feedback.value = 'Lançamento excluído.'
  }
}

watch(activeWorkspaceId, () => { resetForm(); feedback.value = '' })
</script>

<template>
  <div class="heading">
    <div>
      <p class="eyebrow">ENTRADAS E SAÍDAS</p>
      <h1>Lançamentos</h1>
      <p>Registre compras avulsas e receitas. A tabela e os gráficos são atualizados automaticamente.</p>
    </div>
    <label>Mês de referência <input v-model="month" type="month" aria-label="Mês para consultar lançamentos" /></label>
  </div>
  <div class="notice">Exemplo: Compra no mercado, R$ 90,00. Você pode criar categorias próprias. Não registre novamente aqui uma conta que já está cadastrada em Contas Mensais, para não somar duas vezes.</div>

  <section class="panel">
    <div class="panel-title"><div><h2>{{ editingId ? 'Editar lançamento' : '+ Novo lançamento' }}</h2><p>Adicione gastos e entradas do dia a dia.</p></div></div>
    <form class="transaction-form" @submit.prevent="submit">
      <label class="transaction-description">Descrição <input v-model="description" required minlength="2" maxlength="120" placeholder="Ex.: Compra no mercado" /></label>
      <label>Valor (R$) <MoneyInput v-model="amount" placeholder="R$ 500,00" required /></label>
      <label>Tipo <select v-model="kind"><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
      <label>Categoria <input v-model="category" list="transaction-categories" minlength="2" maxlength="40" required placeholder="Digite ou escolha" /><datalist id="transaction-categories"><option v-for="item in categorySuggestions" :key="item" :value="item" /></datalist></label>
      <label>Data <input v-model="occurredOn" type="date" required /></label>
      <div class="transaction-actions"><button type="submit" class="primary"><UiIcon :name="editingId ? 'check' : 'plus'" :size="16" /> {{ editingId ? 'Salvar alterações' : 'Adicionar' }}</button><button v-if="editingId" type="button" class="secondary-action" @click="resetForm">Cancelar</button></div>
    </form>
    <p v-if="feedback" class="success" role="status">{{ feedback }}</p>
    <p v-if="error || formError" class="error" role="alert">{{ formError || error }}</p>
  </section>

  <section class="transaction-stats" aria-label="Resumo de lançamentos do mês">
    <article class="stat"><span>Despesas avulsas</span><strong class="up">{{ formatBRL(summary.expensesCents) }}</strong><small>{{ formatYearMonth(month) }}</small></article>
    <article class="stat"><span>Receitas registradas</span><strong class="down">{{ formatBRL(summary.incomeCents) }}</strong><small>{{ formatYearMonth(month) }}</small></article>
    <article class="stat"><span>Diferença entre entradas e saídas</span><strong :class="summary.netCents < 0 ? 'up' : 'down'">{{ summary.netCents < 0 ? '−' : '' }}{{ formatBRL(Math.abs(summary.netCents)) }}</strong><small>Somente lançamentos avulsos, não é saldo bancário</small></article>
  </section>

  <div class="transaction-charts">
    <section class="panel">
      <div class="panel-title"><div><h2>Despesas por categoria</h2><p>Gráfico referente a {{ formatYearMonth(month) }}</p></div></div>
      <p v-if="!categories.length" class="empty">Registre uma despesa para visualizar o gráfico.</p>
      <div v-else class="category-chart" role="img" :aria-label="'Despesas por categoria: ' + categories.map(item => item.category + ' ' + formatBRL(item.amountCents)).join(', ')">
        <div v-for="item in categories" :key="item.category" class="category-chart-row">
          <div class="chart-row-heading"><span>{{ item.category }}</span><strong>{{ formatBRL(item.amountCents) }}</strong></div>
          <div class="chart-track"><div class="chart-fill" :style="{ width: (item.amountCents / highest * 100) + '%' }"></div></div>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-title"><div><h2>Evolução dos gastos</h2><p>Últimos 6 meses, até {{ formatYearMonth(month) }}</p></div></div>
      <div class="month-chart" role="img" :aria-label="'Gastos por mês: ' + previousMonths.map(item => item.yearMonth + ' ' + formatBRL(item.expense)).join(', ')">
        <div v-for="item in previousMonths" :key="item.yearMonth" class="month-column" :title="item.yearMonth + ': ' + formatBRL(item.expense)">
          <strong>{{ item.expense ? formatBRL(item.expense) : '—' }}</strong>
          <div class="month-bar-track"><div class="month-bar" :style="{ height: (item.expense / monthlyMax * 100) + '%' }"></div></div>
          <small>{{ item.name }}</small>
        </div>
      </div>
    </section>
  </div>

  <section class="panel history">
    <div class="panel-title"><div><h2>Planilha de {{ formatYearMonth(month) }}</h2><p>Consulte, edite e exclua lançamentos do período.</p></div><strong>{{ visible.length }} registros</strong></div>
    <p v-if="!visible.length" class="empty">Ainda não há lançamentos neste mês. Experimente adicionar “Compra no mercado”, R$ 90,00.</p>
    <div v-else class="scroll">
      <table class="transactions-table">
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Valor</th><th>Ações</th></tr></thead>
        <tbody>
          <tr v-for="item in visible" :key="item.id">
            <td>{{ item.occurredOn.split('-').reverse().join('/') }}</td>
            <td><strong>{{ item.description }}</strong></td>
            <td>{{ item.category }}</td>
            <td>{{ item.kind === 'expense' ? 'Despesa' : 'Receita' }}</td>
            <td :class="item.kind === 'expense' ? 'up' : 'down'">{{ item.kind === 'expense' ? '−' : '+' }} {{ formatBRL(item.amountCents) }}</td>
            <td class="row-actions"><button type="button" @click="edit(item)"><UiIcon name="edit" :size="15" /> Editar</button><button type="button" @click="deleteTransaction(item)"><UiIcon name="trash" :size="15" /> Excluir</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
