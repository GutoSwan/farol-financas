import type { RecurringBillRepository } from '../../domain/repositories/RecurringBillRepository'

/** Exclui apenas o valor do mês; mantém o cadastro da conta e os demais meses. */
export function deleteMonthlyBillEntry(repository: RecurringBillRepository, entryId: string): void {
  if (!repository.listEntries().some((entry) => entry.id === entryId)) {
    throw new Error('O registro mensal não existe ou já foi excluído.')
  }
  repository.removeEntry(entryId)
}
