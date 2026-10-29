<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiIcon from '../components/UiIcon.vue'
import MoneyInput from '../components/MoneyInput.vue'
import { useBudgets } from '../composables/useBudgets'
import { useTransactions } from '../composables/useTransactions'
import { activeWorkspaceId } from '../composables/useWorkspaces'
import { budgetProjectSummary, itemSummary, linkedProjectExpenses } from '../../domain/services/budgetAnalytics'
import type { BudgetProjectStatus } from '../../domain/entities/BudgetProject'
import type { Transaction } from '../../domain/entities/Transaction'
import { formatBRL, parseBRLToCents } from '../../domain/value-objects/Money'

const { projects, items, quotes, error: budgetError, createProject, editProject, addItem, editItem, addQuote, selectQuote, removeQuote } = useBudgets()
const { transactions, error: transactionError, upsert } = useTransactions()

const statusLabels: Record<BudgetProjectStatus, string> = {
  planning: 'Planejando', quoting: 'Recebendo propostas', approved: 'Aprovado',
  'in-progress': 'Em andamento', completed: 'Concluído',
}
const today = () => {
  const date = new Date()
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

const selectedProjectId = ref('')
const selectedItemId = ref('')
const projectTitle = ref('')
const projectCategory = ref('Reforma')
const projectTarget = ref('')
const projectNotes = ref('')
const editingProject = ref(false)
const editedTitle = ref('')
const editedCategory = ref('')
const editedTarget = ref('')
const editedNotes = ref('')
const editedStatus = ref<BudgetProjectStatus>('planning')

const newItemTitle = ref('')
const newItemTarget = ref('')
const editingItemId = ref('')
const editedItemTitle = ref('')
const editedItemTarget = ref('')
const provider = ref('')
const quoteAmount = ref('')
const quoteDays = ref('')
const quoteMaterials = ref(false)
const quoteNotes = ref('')
const expenseDescription = ref('')
const expenseAmount = ref('')
const expenseCategory = ref('Reforma')
const expenseDate = ref(today())
const existingTransactionId = ref('')
const feedback = ref('')
const formError = ref('')

const selectedProject = computed(() => projects.value.find((project) => project.id === selectedProjectId.value))
const projectItems = computed(() => items.value.filter((item) => item.projectId === selectedProjectId.value))
const selectedItem = computed(() => projectItems.value.find((item) => item.id === selectedItemId.value))
const itemQuotes = computed(() => quotes.value.filter((quote) => quote.itemId === selectedItemId.value)
  .sort((a, b) => a.amountCents - b.amountCents))
const projectExpenses = computed(() => linkedProjectExpenses(selectedProjectId.value, transactions.value)
  .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)))
const freeExpenses = computed(() => transactions.value.filter((entry) => entry.kind === 'expense' && !entry.budgetProjectId))
const projectSummary = computed(() => selectedProject.value
  ? budgetProjectSummary(selectedProject.value, items.value, quotes.value, transactions.value)
  : null)
const selectedItemSummary = computed(() => selectedItem.value
  ? itemSummary(selectedItem.value, quotes.value, transactions.value) : null)

watch(projects, (value) => {
  if (!value.some((project) => project.id === selectedProjectId.value)) selectedProjectId.value = value[0]?.id ?? ''
}, { immediate: true })
watch([selectedProjectId, items], () => {
  if (!projectItems.value.some((item) => item.id === selectedItemId.value)) {
    selectedItemId.value = projectItems.value[0]?.id ?? ''
  }
}, { immediate: true })
watch(selectedProject, (project) => {
  editingProject.value = false
  if (!project) return
  editedTitle.value = project.title
  editedCategory.value = project.category
  editedTarget.value = formatBRL(project.targetCents)
  editedStatus.value = project.status
  editedNotes.value = project.notes
}, { immediate: true })
watch(activeWorkspaceId, () => {
  selectedProjectId.value = ''
  selectedItemId.value = ''
  editingProject.value = false
  editingItemId.value = ''
  feedback.value = ''
  formError.value = ''
  existingTransactionId.value = ''
})

function tell(message: string) { feedback.value = message; formError.value = '' }
function parseOptional(value: string): number | null { return value.trim() ? parseBRLToCents(value) : null }
function showError(cause: unknown) {
  formError.value = cause instanceof Error ? cause.message : 'Confira os dados informados.'
  feedback.value = ''
}

function create(): void {
  try {
    if (!createProject(projectTitle.value, projectCategory.value, parseBRLToCents(projectTarget.value), projectNotes.value)) return
    selectedProjectId.value = projects.value[projects.value.length - 1]?.id ?? ''
    projectTitle.value = ''
    projectTarget.value = ''
    projectNotes.value = ''
    tell('Projeto criado. Adicione os itens que precisam de orçamento.')
  } catch (cause) { showError(cause) }
}

function updateProject(): void {
  if (!selectedProject.value) return
  try {
    if (!editProject(selectedProject.value.id, editedTitle.value, editedCategory.value, parseBRLToCents(editedTarget.value), editedNotes.value, editedStatus.value)) return
    editingProject.value = false
    tell('Informações do projeto atualizadas.')
  } catch (cause) { showError(cause) }
}

function createItem(): void {
  if (!selectedProject.value) return
  try {
    if (!addItem(selectedProject.value.id, newItemTitle.value, parseOptional(newItemTarget.value))) return
    const added = items.value.filter((item) => item.projectId === selectedProjectId.value)
    selectedItemId.value = added[added.length - 1]?.id ?? ''
    newItemTitle.value = ''
    newItemTarget.value = ''
    tell('Item adicionado. Agora você pode comparar propostas.')
  } catch (cause) { showError(cause) }
}

function startItemEdit(): void {
  if (!selectedItem.value) return
  editingItemId.value = selectedItem.value.id
  editedItemTitle.value = selectedItem.value.title
  editedItemTarget.value = selectedItem.value.plannedCents === null ? '' : formatBRL(selectedItem.value.plannedCents)
}

function saveItemEdit(): void {
  if (!selectedItem.value) return
  try {
    if (!editItem(selectedItem.value.id, editedItemTitle.value, parseOptional(editedItemTarget.value))) return
    editingItemId.value = ''
    tell('Item atualizado.')
  } catch (cause) { showError(cause) }
}

function registerQuote(): void {
  if (!selectedItem.value) return
  try {
    const days = quoteDays.value.trim() === '' ? null : Number(quoteDays.value)
    if (!addQuote(selectedItem.value.id, provider.value, parseBRLToCents(quoteAmount.value), days, quoteMaterials.value, quoteNotes.value)) return
    provider.value = ''
    quoteAmount.value = ''
    quoteDays.value = ''
    quoteMaterials.value = false
    quoteNotes.value = ''
    tell('Proposta cadastrada. Se decidir contratar, selecione a proposta.')
  } catch (cause) { showError(cause) }
}

function chooseQuote(quoteId: string, selected: boolean): void {
  if (!selectedItem.value) return
  if (selectQuote(selectedItem.value.id, selected ? null : quoteId)) {
    tell(selected ? 'Seleção da proposta removida.' : 'Proposta escolhida para este item.')
  }
}

function removeProposal(id: string): void {
  if (!window.confirm('Excluir esta proposta de orçamento? Os lançamentos financeiros não serão apagados.')) return
  if (removeQuote(id)) tell('Proposta excluída.')
}

function addExpense(): void {
  if (!selectedProject.value || !selectedItem.value) return
  try {
    if (!upsert({
      description: expenseDescription.value,
      amountCents: parseBRLToCents(expenseAmount.value),
      category: expenseCategory.value,
      kind: 'expense',
      occurredOn: expenseDate.value,
      budgetProjectId: selectedProject.value.id,
      budgetItemId: selectedItem.value.id,
    })) return
    expenseDescription.value = ''
    expenseAmount.value = ''
    tell('Despesa registrada em Lançamentos e vinculada ao projeto. Não foi duplicada.')
  } catch (cause) { showError(cause) }
}

function copyWithLink(entry: Transaction, projectId: string | null, itemId: string | null): boolean {
  return upsert({
    id: entry.id, description: entry.description, amountCents: entry.amountCents,
    category: entry.category, kind: 'expense', occurredOn: entry.occurredOn,
    budgetProjectId: projectId, budgetItemId: itemId,
  })
}

function linkExisting(): void {
  if (!selectedProject.value || !selectedItem.value) return
  const entry = freeExpenses.value.find((item) => item.id === existingTransactionId.value)
  if (!entry) { formError.value = 'Selecione uma despesa existente.'; return }
  if (copyWithLink(entry, selectedProject.value.id, selectedItem.value.id)) {
    existingTransactionId.value = ''
    tell('Despesa existente vinculada sem criar outro lançamento.')
  }
}

function unlink(entry: Transaction): void {
  if (!window.confirm('Desvincular esta despesa do projeto? Ela permanecerá em Lançamentos.')) return
  if (copyWithLink(entry, null, null)) tell('Despesa desvinculada. O lançamento original permanece.')
}
</script>

<template>
  <div class="heading">
    <div><p class="eyebrow">PLANEJAMENTO E COTAÇÕES</p><h1>Orçamentos</h1>
      <p>Organize projetos, compare profissionais e lojas e acompanhe o que realmente foi gasto.</p></div>
  </div>
  <div class="notice">Uma proposta de preço não é um pagamento. Somente despesas registradas em Lançamentos entram em seus gastos reais.</div>

  <div class="finance-flow">
    <section class="panel">
      <div class="panel-title">
        <div><h2>Seus projetos</h2><p>Ex.: Reforma do banheiro, compra de móveis ou conserto do carro.</p></div>
        <span class="count-chip">{{ projects.length }} projeto(s)</span>
      </div>
      <form class="budget-form" @submit.prevent="create">
        <label class="budget-form-wide">Nome do projeto<input v-model="projectTitle" required minlength="2" maxlength="120" placeholder="Ex.: Reforma do banheiro" /></label>
        <label>Categoria<input v-model="projectCategory" required minlength="2" maxlength="40" placeholder="Ex.: Reforma" /></label>
        <label>Quanto queremos gastar?<MoneyInput v-model="projectTarget" required placeholder="R$ 3.000,00" /></label>
        <label class="budget-form-wide">Observações (opcional)<textarea v-model="projectNotes" rows="2" maxlength="500" placeholder="Ex.: Assentamento de piso e acabamento" /></label>
        <div class="budget-form-wide"><button class="primary" type="submit"><UiIcon name="plus" :size="16" /> Criar projeto</button></div>
      </form>
      <div v-if="!projects.length" class="empty">Nenhum projeto ainda. Crie o primeiro para começar a comparar cotações.</div>
      <div v-else class="budget-project-list">
        <button v-for="project in projects" :key="project.id" type="button"
          class="budget-project-choice" :class="{ active: project.id === selectedProjectId }"
          @click="selectedProjectId = project.id">
          <span><strong>{{ project.title }}</strong><small>{{ project.category }} · {{ statusLabels[project.status] }}</small></span>
          <span class="expense-text">{{ formatBRL(project.targetCents) }}</span>
        </button>
      </div>
    </section>

    <template v-if="selectedProject">
      <section class="panel">
        <div class="panel-title">
          <div><h2>{{ selectedProject.title }}</h2><p>{{ statusLabels[selectedProject.status] }} · {{ selectedProject.category }}</p></div>
          <button class="secondary-action" type="button" @click="editingProject = !editingProject">
            <UiIcon name="edit" :size="15" /> {{ editingProject ? 'Fechar edição' : 'Editar projeto' }}
          </button>
        </div>
        <form v-if="editingProject" class="budget-form budget-form-edit" @submit.prevent="updateProject">
          <label class="budget-form-wide">Nome<input v-model="editedTitle" required minlength="2" maxlength="120" /></label>
          <label>Categoria<input v-model="editedCategory" required minlength="2" maxlength="40" /></label>
          <label>Valor desejado<MoneyInput v-model="editedTarget" required /></label>
          <label>Situação<select v-model="editedStatus">
            <option v-for="(label, code) in statusLabels" :key="code" :value="code">{{ label }}</option>
          </select></label>
          <label class="budget-form-wide">Observações<textarea v-model="editedNotes" rows="2" maxlength="500" /></label>
          <button type="submit" class="primary">Salvar projeto</button>
        </form>
        <p v-else-if="selectedProject.notes" class="budget-project-notes">{{ selectedProject.notes }}</p>

        <div v-if="projectSummary" class="budget-summary-grid">
          <div><span>Queremos gastar</span><strong>{{ formatBRL(projectSummary.targetCents) }}</strong></div>
          <div><span>Propostas escolhidas</span><strong class="expense-text">{{ formatBRL(projectSummary.approvedCents) }}</strong>
            <small>{{ projectSummary.approvedItems }} de {{ projectSummary.itemCount }} itens aprovados</small></div>
          <div><span>Gasto real até agora</span><strong class="expense-text">{{ formatBRL(projectSummary.spentCents) }}</strong></div>
          <div><span>{{ projectSummary.remainingCents >= 0 ? 'Ainda disponível' : 'Acima do planejado' }}</span>
            <strong :class="projectSummary.remainingCents >= 0 ? 'positive-text' : 'expense-text'">
              {{ formatBRL(Math.abs(projectSummary.remainingCents)) }}</strong></div>
        </div>
        <p v-if="projectSummary" class="budget-disclaimer">
          O valor das propostas escolhidas pode estar incompleto até que cada item tenha uma seleção. O valor gasto é extraído de lançamentos financeiros vinculados.
        </p>
      </section>

      <section class="panel">
        <div class="panel-title"><div><h2>Itens do projeto</h2><p>Adicione mão de obra, piso, argamassa e tudo que precisa ser orçado.</p></div></div>
        <form class="budget-form" @submit.prevent="createItem">
          <label>Item ou serviço<input v-model="newItemTitle" required minlength="2" maxlength="120" placeholder="Ex.: Assentamento de piso" /></label>
          <label>Limite desejado para o item (opcional)<MoneyInput v-model="newItemTarget" /></label>
          <div class="budget-form-wide"><button type="submit" class="primary"><UiIcon name="plus" :size="16" /> Adicionar item</button></div>
        </form>
        <div v-if="!projectItems.length" class="empty">Adicione pelo menos um item antes de cadastrar propostas.</div>
        <div v-else class="budget-items">
          <button v-for="item in projectItems" :key="item.id" type="button" class="budget-item"
            :class="{ active: item.id === selectedItemId }" @click="selectedItemId = item.id; editingItemId = ''">
            <span><strong>{{ item.title }}</strong>
              <small>{{ quotes.filter((quote) => quote.itemId === item.id).length }} proposta(s) ·
                {{ item.plannedCents === null ? 'Sem limite específico' : 'Limite ' + formatBRL(item.plannedCents) }}</small></span>
            <UiIcon name="arrow" :size="17" />
          </button>
        </div>
      </section>

      <section v-if="selectedItem" class="panel">
        <div class="panel-title">
          <div><h2>Cotações de {{ selectedItem.title }}</h2><p>Compare valores e escolha a proposta que preferir.</p></div>
          <button class="secondary-action" type="button" @click="editingItemId === selectedItem.id ? editingItemId = '' : startItemEdit()">
            <UiIcon name="edit" :size="15" /> Editar item
          </button>
        </div>
        <form v-if="editingItemId === selectedItem.id" class="budget-form budget-form-edit" @submit.prevent="saveItemEdit">
          <label>Nome do item<input v-model="editedItemTitle" required minlength="2" maxlength="120" /></label>
          <label>Limite desejado<MoneyInput v-model="editedItemTarget" /></label>
          <button type="submit" class="primary">Salvar item</button>
        </form>
        <form class="budget-form" @submit.prevent="registerQuote">
          <label>Profissional ou loja<input v-model="provider" required minlength="2" maxlength="120" placeholder="Ex.: Pedreiro João" /></label>
          <label>Valor proposto<MoneyInput v-model="quoteAmount" required placeholder="R$ 2.700,00" /></label>
          <label>Prazo estimado (dias, opcional)<input v-model="quoteDays" type="number" min="1" max="3650" placeholder="Ex.: 10" /></label>
          <label class="budget-check"><input v-model="quoteMaterials" type="checkbox" /> Materiais inclusos no preço</label>
          <label class="budget-form-wide">Observações<textarea v-model="quoteNotes" rows="2" maxlength="500" placeholder="Ex.: Inclui rejunte e rodapé" /></label>
          <div class="budget-form-wide"><button type="submit" class="primary"><UiIcon name="plus" :size="16" /> Adicionar proposta</button></div>
        </form>
        <div v-if="!itemQuotes.length" class="empty">Ainda não há propostas para este item.</div>
        <div v-else class="budget-quote-list">
          <article v-for="quote in itemQuotes" :key="quote.id" class="budget-quote" :class="{ chosen: quote.selected }">
            <div class="budget-quote-head"><div><strong>{{ quote.provider }}</strong><small>{{ quote.estimatedDays ? quote.estimatedDays + ' dias' : 'Prazo não informado' }} · {{ quote.materialsIncluded ? 'Materiais inclusos' : 'Materiais não inclusos' }}</small></div>
              <strong class="expense-text">{{ formatBRL(quote.amountCents) }}</strong></div>
            <p v-if="quote.notes">{{ quote.notes }}</p>
            <div class="budget-quote-foot">
              <span v-if="selectedItemSummary?.cheapestCents === quote.amountCents" class="budget-best">Menor valor recebido</span>
              <span v-if="selectedItem.plannedCents !== null" :class="quote.amountCents <= selectedItem.plannedCents ? 'positive-text' : 'expense-text'">
                {{ quote.amountCents <= selectedItem.plannedCents ? 'Dentro do limite' : 'Acima do limite' }}
              </span>
              <button type="button" :class="quote.selected ? 'secondary-action' : 'primary'" @click="chooseQuote(quote.id, quote.selected)">
                <UiIcon :name="quote.selected ? 'restore' : 'check'" :size="15" />
                {{ quote.selected ? 'Desfazer escolha' : 'Escolher proposta' }}</button>
              <button type="button" class="icon-action danger" :title="'Excluir proposta de ' + quote.provider" :aria-label="'Excluir proposta de ' + quote.provider" @click="removeProposal(quote.id)">
                <UiIcon name="trash" :size="16" /></button>
            </div>
          </article>
        </div>
      </section>

      <section v-if="selectedItem" class="panel">
        <div class="panel-title"><div><h2>Gastos reais do projeto</h2>
          <p>Registre pagamentos deste item ou vincule uma compra já cadastrada.</p></div></div>
        <form class="budget-form" @submit.prevent="addExpense">
          <label class="budget-form-wide">Descrição do pagamento<input v-model="expenseDescription" required minlength="2" maxlength="120" placeholder="Ex.: Entrada para pedreiro" /></label>
          <label>Valor pago<MoneyInput v-model="expenseAmount" required /></label>
          <label>Data<input v-model="expenseDate" type="date" required /></label>
          <label>Categoria<input v-model="expenseCategory" required minlength="2" maxlength="40" /></label>
          <div class="budget-form-wide"><button type="submit" class="primary"><UiIcon name="plus" :size="16" /> Registrar despesa e vincular</button></div>
        </form>
        <div class="budget-existing-link">
          <h3>Já cadastrou o pagamento em Lançamentos?</h3>
          <form @submit.prevent="linkExisting">
            <label>Selecionar despesa ainda não vinculada
              <select v-model="existingTransactionId" required>
                <option value="" disabled>Selecione o lançamento</option>
                <option v-for="entry in freeExpenses" :key="entry.id" :value="entry.id">{{ entry.occurredOn.split('-').reverse().join('/') }} · {{ entry.description }} · {{ formatBRL(entry.amountCents) }}</option>
              </select>
            </label>
            <button class="secondary-action" type="submit" :disabled="!existingTransactionId">Vincular a {{ selectedItem.title }}</button>
          </form>
        </div>
        <div class="budget-payment-list">
          <h3>Pagamentos vinculados ao projeto</h3>
          <div v-if="!projectExpenses.length" class="empty">Nenhum pagamento vinculado ainda. Propostas não contam como despesas pagas.</div>
          <div v-else class="scroll"><table>
            <thead><tr><th>Data</th><th>Descrição</th><th>Item</th><th>Valor</th><th>Ação</th></tr></thead>
            <tbody><tr v-for="entry in projectExpenses" :key="entry.id">
              <td>{{ entry.occurredOn.split('-').reverse().join('/') }}</td>
              <td>{{ entry.description }}</td>
              <td>{{ projectItems.find((item) => item.id === entry.budgetItemId)?.title ?? 'Item não localizado' }}</td>
              <td><strong class="expense-text">{{ formatBRL(entry.amountCents) }}</strong></td>
              <td><button type="button" class="secondary-action" @click="unlink(entry)">Desvincular</button></td>
            </tr></tbody>
          </table></div>
        </div>
      </section>
    </template>
    <p v-if="feedback" class="success" role="status">{{ feedback }}</p>
    <p v-if="formError || budgetError || transactionError" class="error" role="alert">{{ formError || budgetError || transactionError }}</p>
  </div>
</template>
