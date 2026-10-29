import { computed, ref, watch } from 'vue'
import { BrowserBillRepository } from '../../infrastructure/persistence/BrowserBillRepository'
import { createRecurringBill } from '../../application/use-cases/createRecurringBill'
import { registerMonthlyBill } from '../../application/use-cases/registerMonthlyBill'
import { deleteMonthlyBillEntry } from '../../application/use-cases/deleteMonthlyBillEntry'
import { activeWorkspaceId } from './useWorkspaces'
import type { RecurringBill } from '../../domain/entities/RecurringBill'
import type { MonthlyBillEntry } from '../../domain/entities/MonthlyBillEntry'

const bills = ref<RecurringBill[]>([])
const entries = ref<MonthlyBillEntry[]>([])
const error = ref('')

function repository(): BrowserBillRepository {
  return new BrowserBillRepository(activeWorkspaceId.value)
}

function refresh(): void {
  bills.value = []
  entries.value = []
  try {
    bills.value = repository().listBills()
    entries.value = repository().listEntries()
    error.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Erro ao ler dados.'
  }
}

export function useBills() {
  watch(activeWorkspaceId, refresh, { immediate: true })

  function addBill(name: string, day: number): string | null {
    try {
      const item = createRecurringBill(repository(), name, day)
      refresh()
      return item.id
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Erro ao cadastrar conta.'
      return null
    }
  }

  function saveEntry(id: string, month: string, amount: number, status: 'paid' | 'pending'): boolean {
    try {
      registerMonthlyBill(repository(), id, month, amount, status)
      refresh()
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Erro ao salvar valor.'
      return false
    }
  }

  function deleteEntry(id: string): boolean {
    try {
      deleteMonthlyBillEntry(repository(), id)
      refresh()
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Erro ao excluir o mês.'
      return false
    }
  }

  return {
    bills: computed(() => bills.value),
    entries: computed(() => entries.value),
    error,
    addBill,
    saveEntry,
    deleteEntry,
  }
}
