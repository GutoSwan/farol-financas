export interface MonthlyBillEntry { id: string; billId: string; yearMonth: string; amountCents: number; status: 'paid' | 'pending'; paidAt: string | null }
