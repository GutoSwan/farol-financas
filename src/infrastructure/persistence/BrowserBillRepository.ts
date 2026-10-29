import type { RecurringBillRepository } from '../../domain/repositories/RecurringBillRepository'
import type { RecurringBill } from '../../domain/entities/RecurringBill'
import type { MonthlyBillEntry } from '../../domain/entities/MonthlyBillEntry'
type Snapshot={ bills: RecurringBill[]; entries: MonthlyBillEntry[] }
const KEY='farol-financas:dev:v1'
export class BrowserBillRepository implements RecurringBillRepository {
 private read():Snapshot {
   try {
     const text=localStorage.getItem(KEY)
     if(!text) return {bills:[],entries:[]}
     const obj:unknown=JSON.parse(text)
     if(!obj || typeof obj!=='object' || !('bills' in obj) || !('entries' in obj)) throw new Error()
     const data=obj as Snapshot
     if(!Array.isArray(data.bills) || !Array.isArray(data.entries)) throw new Error()
     return data
   } catch { throw new Error('Dados locais indisponíveis; não limpe o navegador antes de recuperar seus dados') }
 }
 private write(value:Snapshot){try{localStorage.setItem(KEY,JSON.stringify(value))}catch{throw new Error('Não foi possível salvar no navegador')}}
 listBills(){return this.read().bills}
 listEntries(){return this.read().entries}
 saveBill(bill:RecurringBill){const db=this.read();db.bills.push(bill);this.write(db)}
 upsertEntry(entry:MonthlyBillEntry){const db=this.read();const i=db.entries.findIndex(e=>e.billId===entry.billId&&e.yearMonth===entry.yearMonth);if(i<0)db.entries.push(entry);else db.entries[i]=entry;this.write(db)}
}
