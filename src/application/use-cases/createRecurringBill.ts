import type { RecurringBillRepository } from '../../domain/repositories/RecurringBillRepository'
import type { RecurringBill } from '../../domain/entities/RecurringBill'
export function createRecurringBill(repository: RecurringBillRepository, nameInput: string, dueDay: number): RecurringBill {
 const name=nameInput.trim()
 if(name.length<2 || name.length>80) throw new Error('Nome deve ter entre 2 e 80 caracteres')
 if(!Number.isInteger(dueDay)||dueDay<1||dueDay>31) throw new Error('Vencimento inválido')
 const bill={id:crypto.randomUUID(),name,dueDay,active:true,createdAt:new Date().toISOString()}
 repository.saveBill(bill); return bill
}
