import { computed, ref, watch } from 'vue'
import type { FixedExpense } from '../../domain/entities/FixedExpense'
import { createFixedExpense, endFixedExpenseAfterMonth, setFixedExpensePaid } from '../../application/use-cases/manageFixedExpense'
import { BrowserFixedExpenseRepository } from '../../infrastructure/persistence/BrowserFixedExpenseRepository'
import { activeWorkspaceId } from './useWorkspaces'

const items = ref<FixedExpense[]>([])
const error = ref('')

function repository() { return new BrowserFixedExpenseRepository(activeWorkspaceId.value) }
function reload() {
  items.value = []
  try { items.value = repository().list(); error.value = '' }
  catch (e) { error.value = e instanceof Error ? e.message : 'Não foi possível ler os gastos fixos.' }
}
watch(activeWorkspaceId, reload, { immediate: true })

export function useFixedExpenses() {
  function create(name: string, amountCents: number, dueDay: number, startMonth: string): boolean {
    try { createFixedExpense(repository(), { name, amountCents, dueDay, startMonth }); reload(); return true }
    catch (e) { error.value = e instanceof Error ? e.message : 'Erro ao cadastrar.'; return false }
  }
  function setPaid(id: string, month: string, paid: boolean): boolean {
    try { setFixedExpensePaid(repository(), id, month, paid); reload(); return true }
    catch (e) { error.value = e instanceof Error ? e.message : 'Erro ao registrar pagamento.'; return false }
  }
  function endAfterMonth(id: string, month: string): boolean {
    try { endFixedExpenseAfterMonth(repository(), id, month); reload(); return true }
    catch (e) { error.value = e instanceof Error ? e.message : 'Erro ao encerrar.'; return false }
  }
  return { fixedExpenses: computed(() => items.value), error, create, setPaid, endAfterMonth }
}
