import { computed, ref, watch } from 'vue'
import type { BudgetSnapshot } from '../../domain/repositories/BudgetRepository'
import { BrowserBudgetRepository } from '../../infrastructure/persistence/BrowserBudgetRepository'
import { createBudgetProject, editBudgetProject, addBudgetItem, editBudgetItem, addBudgetQuote, selectBudgetQuote, deleteBudgetQuote } from '../../application/use-cases/manageBudget'
import type { BudgetProjectStatus } from '../../domain/entities/BudgetProject'
import { activeWorkspaceId } from './useWorkspaces'

const state = ref<BudgetSnapshot>({ projects: [], items: [], quotes: [] })
const error = ref('')

function repository(): BrowserBudgetRepository {
  return new BrowserBudgetRepository(activeWorkspaceId.value)
}

function reload() {
  state.value = { projects: [], items: [], quotes: [] }
  try { state.value = repository().read(); error.value = '' }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar orçamentos.' }
}
watch(activeWorkspaceId, reload, { immediate: true })

export function useBudgets() {
  function execute(work: (repo: BrowserBudgetRepository) => void): boolean {
    try {
      work(repository())
      reload()
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Não foi possível salvar o orçamento.'
      return false
    }
  }

  return {
    projects: computed(() => state.value.projects),
    items: computed(() => state.value.items),
    quotes: computed(() => state.value.quotes),
    error,
    reload,
    createProject: (title: string, category: string, targetCents: number, notes: string) =>
      execute((repo) => { createBudgetProject(repo, { title, category, targetCents, notes }) }),
    editProject: (id: string, title: string, category: string, targetCents: number, notes: string, status: BudgetProjectStatus) =>
      execute((repo) => { editBudgetProject(repo, id, { title, category, targetCents, notes, status }) }),
    addItem: (projectId: string, title: string, plannedCents: number | null) =>
      execute((repo) => { addBudgetItem(repo, projectId, title, plannedCents) }),
    editItem: (itemId: string, title: string, plannedCents: number | null) =>
      execute((repo) => { editBudgetItem(repo, itemId, title, plannedCents) }),
    addQuote: (itemId: string, provider: string, amountCents: number, estimatedDays: number | null, materialsIncluded: boolean, notes: string) =>
      execute((repo) => { addBudgetQuote(repo, { itemId, provider, amountCents, estimatedDays, materialsIncluded, notes }) }),
    selectQuote: (itemId: string, quoteId: string | null) => execute((repo) => { selectBudgetQuote(repo, itemId, quoteId) }),
    removeQuote: (quoteId: string) => execute((repo) => { deleteBudgetQuote(repo, quoteId) }),
  }
}
