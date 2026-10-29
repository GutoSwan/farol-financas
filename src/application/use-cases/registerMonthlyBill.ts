import type { RecurringBillRepository } from '../../domain/repositories/RecurringBillRepository'
import { assertMoney } from '../../domain/value-objects/Money'
export function registerMonthlyBill(repository: RecurringBillRepository, billId: string, yearMonth: string, amountCents: number, status: 'paid' | 'pending') {
 const bill = repository.listBills().find(b => b.id === billId)
 if (!bill) throw new Error('Conta não encontrada')
 if (!bill.active) throw new Error('Reative a conta arquivada antes de registrar novos meses.')
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) throw new Error('Mês inválido')
 assertMoney(amountCents)
 if(status!=='paid' && status!=='pending') throw new Error('Status inválido')
 const prior=repository.listEntries().find(e=>e.billId===billId && e.yearMonth===yearMonth)
 const entry={id:prior?.id ?? crypto.randomUUID(),billId,yearMonth,amountCents,status,paidAt:status==='paid' ? (prior?.status==='paid' ? prior.paidAt : new Date().toISOString()) : null}
 repository.upsertEntry(entry); return entry
}
