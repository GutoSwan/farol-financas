import { describe,it,expect } from 'vitest'
import { changePercentage,paidForMonth,totalForMonth } from '../src/domain/services/billAnalytics'
import type { MonthlyBillEntry } from '../src/domain/entities/MonthlyBillEntry'
const entries:MonthlyBillEntry[]=[{id:'1',billId:'energia',yearMonth:'2026-09',amountCents:20000,status:'paid',paidAt:null},{id:'2',billId:'agua',yearMonth:'2026-09',amountCents:10000,status:'pending',paidAt:null}]
describe('Histórico financeiro',()=>{it('não confunde pago e pendente',()=>{expect(totalForMonth(entries,'2026-09')).toBe(30000);expect(paidForMonth(entries,'2026-09')).toBe(20000)});it('calcula variação',()=>{expect(changePercentage(110,100)).toBe(10);expect(changePercentage(100,0)).toBeNull()})})
