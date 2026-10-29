<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MoneyInput from '../components/MoneyInput.vue'
import { useFixedExpenses } from '../composables/useFixedExpenses'
import { activeWorkspaceId } from '../composables/useWorkspaces'
import { fixedExpenseSummary, fixedExpensesForMonth } from '../../domain/services/fixedExpenseAnalytics'
import { parseBRLToCents, formatBRL } from '../../domain/value-objects/Money'
import { currentYearMonth, formatYearMonth } from '../../shared/date'
import type { FixedExpense } from '../../domain/entities/FixedExpense'

const { fixedExpenses, error, create, setPaid, endAfterMonth } = useFixedExpenses()
const month = ref(currentYearMonth())
const name = ref('')
const amount = ref('')
const dueDay = ref(10)
const startMonth = ref(currentYearMonth())
const feedback = ref('')
const formError = ref('')

const visible = computed(() => fixedExpensesForMonth(fixedExpenses.value, month.value).sort((a, b) => a.dueDay - b.dueDay))
const summary = computed(() => fixedExpenseSummary(fixedExpenses.value, month.value))
const ended = computed(() => fixedExpenses.value.filter((item) => item.endBeforeMonth && item.endBeforeMonth <= month.value))

function addExpense(): void {
  feedback.value = ''
  formError.value = ''
  try {
    if (create(name.value, parseBRLToCents(amount.value), Number(dueDay.value), startMonth.value)) {
      name.value = ''
      amount.value = ''
      dueDay.value = 10
      feedback.value = 'Gasto fixo cadastrado e previsto automaticamente para os próximos meses.'
    }
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : 'Confira os dados informados.'
  }
}

function changePaid(item: FixedExpense): void {
  feedback.value = ''
  if (setPaid(item.id, month.value, !item.paidMonths.includes(month.value))) {
    feedback.value = 'Status de pagamento atualizado somente para ' + formatYearMonth(month.value) + '.'
  }
}

function archive(item: FixedExpense): void {
  if (!window.confirm(
    `Encerrar "${item.name}" após ${formatYearMonth(month.value)}?\n\nOs meses anteriores serão preservados, e a cobrança deixará de aparecer a partir do próximo mês.`
  )) return
  feedback.value = ''
  if (endAfterMonth(item.id, month.value)) feedback.value = 'Gasto fixo encerrado a partir do mês seguinte.'
}

watch(activeWorkspaceId, () => {
  name.value = ''
  amount.value = ''
  feedback.value = ''
  formError.value = ''
})
</script>

<template>
  <div class="heading">
    <div>
      <p class="eyebrow">DESPESAS RECORRENTES</p>
      <h1>Gastos fixos</h1>
      <p>Aluguel, streaming, academia e outras cobranças que se repetem com o mesmo valor.</p>
    </div>
    <label>Mês de referência <input v-model="month" type="month" /></label>
  </div>

  <div class="notice">
    Gastos fixos entram na previsão de cada mês a partir do mês inicial, mesmo que ainda estejam pendentes.
    Registrar o pagamento só altera o status, sem criar outra despesa.
  </div>

  <div class="transaction-stats">
    <article class="stat"><span>Gastos fixos previstos</span><strong>{{ formatBRL(summary.totalCents) }}</strong><small>{{ summary.count }} cobrança(s) em {{ formatYearMonth(month) }}</small></article>
    <article class="stat"><span>Já pagos</span><strong class="down">{{ formatBRL(summary.paidCents) }}</strong><small>Marcados como pagos neste mês</small></article>
    <article class="stat"><span>Ainda pendentes</span><strong class="up">{{ formatBRL(summary.pendingCents) }}</strong><small>Aguardando confirmação do pagamento</small></article>
  </div>

  <div class="columns">
    <section class="panel">
      <div class="panel-title"><div><h2>+ Cadastrar gasto fixo</h2><p>Uma vez cadastrado, o valor se repete nos meses seguintes.</p></div></div>
      <form class="form" @submit.prevent="addExpense">
        <label>Descrição<input v-model="name" placeholder="Ex.: Aluguel ou Netflix" required minlength="2" maxlength="80" /></label>
        <label>Valor mensal<MoneyInput v-model="amount" required placeholder="R$ 120,00" /></label>
        <label>Dia de vencimento<input v-model.number="dueDay" type="number" min="1" max="31" required /></label>
        <label>Início da cobrança<input v-model="startMonth" type="month" required /></label>
        <button type="submit" class="primary">+ Cadastrar gasto fixo</button>
      </form>
      <p v-if="feedback" class="success" role="status">{{ feedback }}</p>
      <p v-if="formError || error" class="error" role="alert">{{ formError || error }}</p>
    </section>

    <section class="panel">
      <div class="panel-title"><div><h2>Despesas de {{ formatYearMonth(month) }}</h2><p>Marque as cobranças conforme forem pagas.</p></div></div>
      <div v-if="!visible.length" class="empty">Nenhum gasto fixo previsto para este mês.</div>
      <div v-else class="fixed-expense-list">
        <article v-for="item in visible" :key="item.id" class="fixed-expense-row">
          <div>
            <strong>{{ item.name }}</strong>
            <span>Dia {{ item.dueDay }} · {{ formatBRL(item.amountCents) }}</span>
            <small>{{ item.paidMonths.includes(month) ? 'Pago' : 'Pendente' }}</small>
          </div>
          <div class="fixed-expense-actions">
            <button type="button" :class="item.paidMonths.includes(month) ? 'secondary-action' : 'primary'" @click="changePaid(item)">
              {{ item.paidMonths.includes(month) ? 'Desmarcar pagamento' : 'Marcar pago' }}
            </button>
            <button v-if="!item.endBeforeMonth" class="archive-action" type="button" @click="archive(item)" title="Encerrar recorrência após o mês selecionado">Encerrar</button>
          </div>
        </article>
      </div>
      <p v-if="ended.length" class="archived-note">{{ ended.length }} gasto(s) já encerrado(s) antes deste mês continuam preservados no histórico.</p>
    </section>
  </div>

  <section class="panel history">
    <div class="panel-title"><div><h2>Como registrar?</h2><p>Evite contar o mesmo gasto duas vezes.</p></div></div>
    <p class="muted">Aluguel de R$ 1.500,00 todos os meses? Cadastre aqui. Conta de energia com valor diferente a cada mês? Use <RouterLink to="/contas-mensais" class="inline-link">Contas mensais</RouterLink>. Compra avulsa no mercado? Use <RouterLink to="/lancamentos" class="inline-link">Lançamentos</RouterLink>.</p>
  </section>
</template>
