import { computed, ref, watch } from 'vue'
import { saveTransaction } from '../../application/use-cases/saveTransaction'
import type { TransactionInput } from '../../application/use-cases/saveTransaction'
import type { Transaction } from '../../domain/entities/Transaction'
import { BrowserTransactionRepository } from '../../infrastructure/persistence/BrowserTransactionRepository'
import { activeWorkspaceId } from './useWorkspaces'

const transactions = ref<Transaction[]>([])
const error = ref('')

function repository(): BrowserTransactionRepository {
  return new BrowserTransactionRepository(activeWorkspaceId.value)
}

function reload(): void {
  transactions.value = []
  try {
    transactions.value = repository().list().sort((a, b) =>
      b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt))
    error.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Erro ao carregar lançamentos.'
  }
}

watch(activeWorkspaceId, reload, { immediate: true })

export function useTransactions() {
  function upsert(input: TransactionInput): boolean {
    try {
      saveTransaction(repository(), input)
      reload()
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Não foi possível salvar.'
      return false
    }
  }

  function remove(id: string): boolean {
    try {
      repository().delete(id)
      reload()
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Não foi possível excluir.'
      return false
    }
  }

  return { transactions: computed(() => transactions.value), error, upsert, remove }
}
