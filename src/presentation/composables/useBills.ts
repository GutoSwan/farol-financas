import { computed, ref } from 'vue'
import { BrowserBillRepository } from '../../infrastructure/persistence/BrowserBillRepository'
import { createRecurringBill } from '../../application/use-cases/createRecurringBill'
import { registerMonthlyBill } from '../../application/use-cases/registerMonthlyBill'
import type { RecurringBill } from '../../domain/entities/RecurringBill'
import type { MonthlyBillEntry } from '../../domain/entities/MonthlyBillEntry'
const repository=new BrowserBillRepository()
const bills=ref<RecurringBill[]>([]),entries=ref<MonthlyBillEntry[]>([]),error=ref('')
function refresh(){try{bills.value=repository.listBills();entries.value=repository.listEntries();error.value=''}catch(e){error.value=e instanceof Error ? e.message : 'Erro ao ler dados'}}
export function useBills(){
 refresh()
 function addBill(name:string,day:number):string|null {try{const item=createRecurringBill(repository,name,day);refresh();return item.id}catch(e){error.value=e instanceof Error?e.message:'Erro';return null}}
 function saveEntry(id:string,month:string,amount:number,status:'paid'|'pending'):boolean {try{registerMonthlyBill(repository,id,month,amount,status);refresh();return true}catch(e){error.value=e instanceof Error?e.message:'Erro';return false}}
 return {bills:computed(()=>bills.value),entries:computed(()=>entries.value),error,addBill,saveEntry}
}
