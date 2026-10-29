import type { RecurringBillRepository } from '../../domain/repositories/RecurringBillRepository'
import type { RecurringBill } from '../../domain/entities/RecurringBill'

function getBill(repository: RecurringBillRepository, id: string): RecurringBill {
  const item = repository.listBills().find((bill) => bill.id === id)
  if (!item) throw new Error('Conta mensal não encontrada.')
  return item
}

export function updateRecurringBill(repository: RecurringBillRepository, id: string, nameInput: string, dueDay: number): void {
  const bill = getBill(repository, id)
  const name = nameInput.trim()
  if (name.length < 2 || name.length > 80) throw new Error('Nome deve ter entre 2 e 80 caracteres.')
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw new Error('Dia de vencimento inválido.')
  repository.saveBill({ ...bill, name, dueDay })
}

export function setRecurringBillActive(repository: RecurringBillRepository, id: string, active: boolean): void {
  const bill = getBill(repository, id)
  repository.saveBill({ ...bill, active })
}

/** Exclusão definitiva: apaga a conta e todos os meses vinculados, numa mesma escrita do repositório. */
export function deleteRecurringBill(repository: RecurringBillRepository, id: string): void {
  getBill(repository, id)
  repository.deleteBillAndEntries(id)
}
