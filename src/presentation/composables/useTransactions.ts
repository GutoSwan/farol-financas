import { computed, ref, watch } from 'vue'
import { saveTransaction } from '../../application/use-cases/saveTransaction'
import type { TransactionInput } from '../../application/use-cases/saveTransaction'
import type { Transaction } from '../../domain/entities/Transaction'
import { BrowserTransactionRepository } from '../../infrastructure/persistence/BrowserTransactionRepository'
import { activeWorkspaceId } from './useWorkspaces'
import { isLegacyOwnerSession } from '../../infrastructure/persistence/legacyAccess'
import { subscribeFinancialUiReset } from './financialUiSession'

const transactions = ref<Transaction[]>([])
const error = ref('')

subscribeFinancialUiReset(() => { transactions.value = []; error.value = '' })

function repository(): BrowserTransactionRepository {
  if (!isLegacyOwnerSession()) throw new Error('Acesso aos lançamentos locais não autorizado para esta sessão.')
  return new BrowserTransactionRepository(activeWorkspaceId.value)
}

function reload(): void {
  transactions.value = []
  if (!isLegacyOwnerSession()) { error.value = ''; return }
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
  reload()
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
