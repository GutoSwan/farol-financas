import type { MonthlyBillEntry } from '../entities/MonthlyBillEntry'
export function getPreviousEntry(entries: MonthlyBillEntry[], billId: string, month: string): MonthlyBillEntry | undefined { return entries.filter(e=>e.billId===billId && e.yearMonth<month).sort((a,b)=>b.yearMonth.localeCompare(a.yearMonth))[0] }
export function changePercentage(current: number, previous: number): number | null { return previous === 0 ? null : ((current-previous)/previous)*100 }
export function totalForMonth(entries: MonthlyBillEntry[], month: string): number { return entries.filter(e=>e.yearMonth===month).reduce((sum,e)=>sum+e.amountCents,0) }
export function paidForMonth(entries: MonthlyBillEntry[], month: string): number { return entries.filter(e=>e.yearMonth===month && e.status==='paid').reduce((sum,e)=>sum+e.amountCents,0) }
