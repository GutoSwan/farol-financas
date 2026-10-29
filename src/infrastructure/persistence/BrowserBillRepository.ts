import type { RecurringBillRepository } from '../../domain/repositories/RecurringBillRepository'
import type { RecurringBill } from '../../domain/entities/RecurringBill'
import type { MonthlyBillEntry } from '../../domain/entities/MonthlyBillEntry'
import { DEFAULT_WORKSPACE_ID } from '../../domain/entities/FinancialWorkspace'

type Snapshot = { bills: RecurringBill[]; entries: MonthlyBillEntry[] }
const LEGACY_KEY = 'farol-financas:dev:v1'

/** Preserva os registros existentes do espaço padrão. */
export function billsStorageKey(workspaceId: string): string {
  if (workspaceId === DEFAULT_WORKSPACE_ID) return LEGACY_KEY
  if (!/^[a-zA-Z0-9-]{1,90}$/.test(workspaceId)) throw new Error('Identificador de espaço inválido.')
  return `${LEGACY_KEY}:workspace:${workspaceId}`
}

/** Persistência provisória; não fornece controle de acesso real. */
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
    const index = data.bills.findIndex((item) => item.id === bill.id)
    if (index < 0) data.bills.push(bill)
    else data.bills[index] = bill
    this.write(data)
  }

  upsertEntry(entry: MonthlyBillEntry): void {
    const data = this.read()
    const index = data.entries.findIndex((item) => item.billId === entry.billId && item.yearMonth === entry.yearMonth)
    if (index < 0) data.entries.push(entry)
    else data.entries[index] = entry
    this.write(data)
  }

  removeEntry(id: string): void {
    const data = this.read()
    if (!data.entries.some((entry) => entry.id === id)) throw new Error('Registro mensal não encontrado.')
    data.entries = data.entries.filter((entry) => entry.id !== id)
    this.write(data)
  }

  deleteBillAndEntries(id: string): void {
    const data = this.read()
    if (!data.bills.some((bill) => bill.id === id)) throw new Error('Conta mensal não encontrada.')
    data.bills = data.bills.filter((bill) => bill.id !== id)
    data.entries = data.entries.filter((entry) => entry.billId !== id)
    this.write(data)
  }
}
