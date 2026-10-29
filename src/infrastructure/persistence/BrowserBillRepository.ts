import type { RecurringBillRepository } from '../../domain/repositories/RecurringBillRepository'
import type { RecurringBill } from '../../domain/entities/RecurringBill'
import type { MonthlyBillEntry } from '../../domain/entities/MonthlyBillEntry'
import { DEFAULT_WORKSPACE_ID } from '../../domain/entities/FinancialWorkspace'

type Snapshot = { bills: RecurringBill[]; entries: MonthlyBillEntry[] }
const LEGACY_KEY = 'farol-financas:dev:v1'

/** Mantém os registros antigos dentro do espaço padrão, sem migração destrutiva. */
export function billsStorageKey(workspaceId: string): string {
  if (workspaceId === DEFAULT_WORKSPACE_ID) return LEGACY_KEY
  if (!/^[a-zA-Z0-9-]{1,90}$/.test(workspaceId)) throw new Error('Identificador de espaço inválido.')
  return `${LEGACY_KEY}:workspace:${workspaceId}`
}

/** Persistência provisória; não é controle de acesso nem isolamento seguro. */
export class BrowserBillRepository implements RecurringBillRepository {
  constructor(private readonly workspaceId = DEFAULT_WORKSPACE_ID) {}

  private read(): Snapshot {
    try {
      const text = localStorage.getItem(billsStorageKey(this.workspaceId))
      if (!text) return { bills: [], entries: [] }
      const parsed: unknown = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || !('bills' in parsed) || !('entries' in parsed)) {
        throw new Error('Formato inválido')
      }
      const data = parsed as Snapshot
      if (!Array.isArray(data.bills) || !Array.isArray(data.entries)) throw new Error('Formato inválido')
      return data
    } catch {
      throw new Error('Dados locais indisponíveis. Não limpe o navegador antes de recuperar seus registros.')
    }
  }

  private write(value: Snapshot): void {
    try {
      localStorage.setItem(billsStorageKey(this.workspaceId), JSON.stringify(value))
    } catch {
      throw new Error('Não foi possível salvar os dados neste navegador.')
    }
  }

  listBills(): RecurringBill[] { return this.read().bills }
  listEntries(): MonthlyBillEntry[] { return this.read().entries }

  saveBill(bill: RecurringBill): void {
    const data = this.read()
    data.bills.push(bill)
    this.write(data)
  }

  upsertEntry(entry: MonthlyBillEntry): void {
    const data = this.read()
    const index = data.entries.findIndex((item) =>
      item.billId === entry.billId && item.yearMonth === entry.yearMonth)
    if (index < 0) data.entries.push(entry)
    else data.entries[index] = entry
    this.write(data)
  }
}
