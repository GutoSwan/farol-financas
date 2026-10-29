import type { RecurringBill } from '../entities/RecurringBill'
import type { MonthlyBillEntry } from '../entities/MonthlyBillEntry'

export interface RecurringBillRepository {
  listBills(): RecurringBill[]
  listEntries(): MonthlyBillEntry[]
  saveBill(bill: RecurringBill): void
  upsertEntry(entry: MonthlyBillEntry): void
  removeEntry(id: string): void
  deleteBillAndEntries(id: string): void
}
