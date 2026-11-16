<script setup lang="ts">
import { ref, watch } from 'vue'
import type { OnlineWorkspace } from '../../infrastructure/api/onlineWorkspaces'
import type { OnlineFinanceRecord, OnlineMonthlyBillEntry } from '../../infrastructure/api/onlineFinance'
import { formatBRL, parseBRLToCents } from '../../domain/value-objects/Money'
import MoneyInput from './MoneyInput.vue'
import { createQaBill, updateQaBill, saveQaMonth, deleteQaBill, deleteQaMonth } from '../../infrastructure/api/qaBills'

const props = defineProps<{
  space: OnlineWorkspace
  userId: string
  records: OnlineFinanceRecord[]
  parentBusy: boolean
}>()
const emit = defineEmits<{ (e: 'refresh'): void }>()

const busy = ref(false)
const error = ref('')
const success = ref('')
const billEditing = ref<{ id: string; version: number } | null>(null)
const billName = ref('')
const dueDay = ref(10)
const active = ref(true)
const monthTarget = ref<{ id: string; version: number; name: string } | null>(null)
const yearMonth = ref(new Date().toLocaleDateString('en-CA').slice(0, 7))
const amount = ref('')
const status = ref<'PENDING' | 'PAID'>('PENDING')

function resetBill(): void {
  billEditing.value = null
  billName.value = ''
  dueDay.value = 10
  active.value = true
}
function resetMonth(): void {
  monthTarget.value = null
  yearMonth.value = new Date().toLocaleDateString('en-CA').slice(0, 7)
  amount.value = ''
  status.value = 'PENDING'
}
watch(() => [props.space.id, props.userId], () => {
  resetBill()
  resetMonth()
  error.value = ''
  success.value = ''
})
function editBill(record: OnlineFinanceRecord): void {
  if (!record.version || !record.dueDay || record.active === undefined) {
    error.value = 'Atualize a consulta antes de editar.'
    return
  }
  billEditing.value = { id: record.id, version: record.version }
  billName.value = record.label
  dueDay.value = record.dueDay
  active.value = record.active
  error.value = ''
  success.value = ''
}
function editMonth(record: OnlineFinanceRecord, entry?: OnlineMonthlyBillEntry): void {
  if (!record.version) {
    error.value = 'Atualize a consulta antes de editar.'
    return
  }
  resetMonth()
  monthTarget.value = { id: record.id, version: record.version, name: record.label }
  if (entry) {
    yearMonth.value = entry.yearMonth
    amount.value = formatBRL(entry.amountCents)
    status.value = entry.status
  }
  error.value = ''
  success.value = ''
}

async function execute(work: () => Promise<unknown>, feedback: string, reset?: () => void): Promise<void> {
  if (busy.value || props.parentBusy) return
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    await work()
    reset?.()
    success.value = feedback
    emit('refresh')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Operação não confirmada.'
  } finally {
    busy.value = false
  }
}
async function submitBill(): Promise<void> {
  const input = { name: billName.value, dueDay: Number(dueDay.value), active: active.value }
  if (billEditing.value) {
    const target = billEditing.value
    await execute(
      () => updateQaBill(props.space, props.userId, target, input),
      'Cadastro mensal atualizado na nuvem.', resetBill,
    )
  } else {
    await execute(
      () => createQaBill(props.space, props.userId, input),
      'Conta mensal fictícia criada na nuvem.', resetBill,
    )
  }
}
async function submitMonth(): Promise<void> {
  if (!monthTarget.value) return
  const target = monthTarget.value
  let amountCents: number
  try {
    amountCents = parseBRLToCents(amount.value)
  } catch {
    error.value = 'Informe um valor em reais válido.'
    return
  }
  await execute(
    () => saveQaMonth(props.space, props.userId, target, {
      yearMonth: yearMonth.value, amountCents, status: status.value,
    }),
    'Valor e situação do mês sincronizados na nuvem.', resetMonth,
  )
}
async function removeBill(record: OnlineFinanceRecord): Promise<void> {
  if (!record.version || !window.confirm('Excluir esta conta fictícia e TODO o seu histórico?')) return
  await execute(
    () => deleteQaBill(props.space, props.userId, { id: record.id, version: record.version! }),
    'Conta fictícia e histórico excluídos.', () => { resetBill(); resetMonth() },
  )
}
async function removeMonth(record: OnlineFinanceRecord, entry: OnlineMonthlyBillEntry): Promise<void> {
  if (!record.version || !window.confirm('Excluir somente ' + entry.yearMonth + ' desta conta fictícia?')) return
  await execute(
    () => deleteQaMonth(props.space, props.userId, { id: record.id, version: record.version! }, entry.yearMonth),
    'Mês selecionado excluído; os demais foram preservados.', resetMonth,
  )
}
</script>

<template>
  <section class="panel">
    <div class="panel-title">
      <div>
        <h2>Gerenciar contas mensais QA</h2>
        <p>Somente Dev. Os dois logins do mesmo espaço compartilham cadastro, valores e pagamentos.</p>
      </div>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="success" class="success" role="status">{{ success }}</p>
    <div v-if="records.length" class="scroll">
      <table>
        <thead><tr><th>Conta fictícia</th><th>Histórico mensal</th><th>Ações</th></tr></thead>
        <tbody>
          <tr v-for="record in records" :key="record.id">
            <td>
              {{ record.label }} · dia {{ record.dueDay }}
              <span v-if="record.active === false">(inativa)</span>
            </td>
            <td>
              <div v-if="!record.monthlyEntries?.length">Sem valores por mês</div>
              <ul v-else>
                <li v-for="entry in record.monthlyEntries" :key="entry.id">
                  {{ entry.yearMonth }} — {{ formatBRL(entry.amountCents) }}
                  ({{ entry.status === 'PAID' ? 'paga' : 'pendente' }})
                  <div class="row-actions">
                    <button type="button" :disabled="busy || parentBusy" @click="editMonth(record, entry)">Editar mês</button>
                    <button type="button" :disabled="busy || parentBusy" @click="removeMonth(record, entry)">Excluir mês</button>
                  </div>
                </li>
              </ul>
            </td>
            <td class="row-actions">
              <button type="button" :disabled="busy || parentBusy" @click="editBill(record)">Editar conta</button>
              <button type="button" :disabled="busy || parentBusy" @click="editMonth(record)">Adicionar mês</button>
              <button type="button" :disabled="busy || parentBusy" @click="removeBill(record)">Excluir conta</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel-title">
      <div>
        <h3>{{ billEditing ? 'Editar cadastro' : 'Nova conta mensal de teste' }}</h3>
        <p>O vencimento pertence ao cadastro; o valor é definido separadamente para cada mês.</p>
      </div>
    </div>
    <form class="form" @submit.prevent="submitBill">
      <label>Nome <input v-model="billName" required maxlength="80" placeholder="Ex.: Internet (teste)" /></label>
      <label>Dia do vencimento <input v-model.number="dueDay" type="number" min="1" max="31" required /></label>
      <label class="row-actions"><input v-model="active" type="checkbox" /> Conta ativa</label>
      <div class="row-actions">
        <button class="primary" type="submit" :disabled="busy || parentBusy">{{ billEditing ? 'Salvar cadastro QA' : 'Cadastrar conta QA' }}</button>
        <button v-if="billEditing" class="secondary-action" type="button" :disabled="busy || parentBusy" @click="resetBill">Cancelar edição</button>
      </div>
    </form>
    <div v-if="monthTarget" class="panel-title">
      <div>
        <h3>Valor e pagamento do mês</h3>
        <p>Conta: <strong>{{ monthTarget.name }}</strong></p>
      </div>
    </div>
    <form v-if="monthTarget" class="form" @submit.prevent="submitMonth">
      <label>Mês <input v-model="yearMonth" type="month" required /></label>
      <label>Valor (R$) <MoneyInput v-model="amount" required placeholder="R$ 12,34" /></label>
      <label>Situação <select v-model="status">
        <option value="PENDING">Pendente</option>
        <option value="PAID">Paga</option>
      </select></label>
      <div class="row-actions">
        <button class="primary" type="submit" :disabled="busy || parentBusy">Salvar mês QA</button>
        <button class="secondary-action" type="button" :disabled="busy || parentBusy" @click="resetMonth">Cancelar</button>
      </div>
    </form>
  </section>
</template>
