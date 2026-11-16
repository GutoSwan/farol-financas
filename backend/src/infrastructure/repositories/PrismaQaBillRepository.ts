import type { Prisma, PrismaClient } from '@prisma/client'
import type { QaBillInput, QaBillRepository, QaMonthInput } from '../../domain/repositories/QaBillRepository.js'
import { QaBillMonthMissingError } from '../../domain/repositories/QaBillRepository.js'
import type { RecurringBillSummary } from '../../domain/repositories/FinancialCatalogRepository.js'
import { StaleFinancialRecordError } from '../../domain/errors/StaleFinancialRecordError.js'

// Reutiliza a credencial técnica QA de escrita, nunca o leitor da API.
// A associação OWNER/EDITOR é verificada ANTES no controlador; RLS restringe
// as duas tabelas exatamente aos UUIDs dos espaços fictícios do Supabase Dev.
const billSelect = {
  id: true, workspaceId: true, name: true, dueDay: true, active: true, version: true,
  entries: {
    select: { id: true, billId: true, yearMonth: true, amountCents: true, status: true, paidAt: true },
    orderBy: [{ yearMonth: 'desc' }, { id: 'desc' }],
    take: 24,
  },
} satisfies Prisma.RecurringBillSelect

export class PrismaQaBillRepository implements QaBillRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async staleOrMissing(workspaceId: string, billId: string): Promise<null> {
    const exists = await this.prisma.recurringBill.findFirst({
      where: { id: billId, workspaceId }, select: { id: true },
    })
    if (exists) throw new StaleFinancialRecordError()
    return null
  }

  async create(workspaceId: string, input: QaBillInput): Promise<RecurringBillSummary> {
    return this.prisma.recurringBill.create({
      data: { workspaceId, ...input },
      select: billSelect,
    })
  }

  async update(
    workspaceId: string, billId: string, version: number, input: Partial<QaBillInput>,
  ): Promise<RecurringBillSummary | null> {
    const updated = await this.prisma.recurringBill.updateMany({
      where: { id: billId, workspaceId, version },
      data: { ...input, version: { increment: 1 } },
    })
    if (updated.count !== 1) return this.staleOrMissing(workspaceId, billId)
    return this.prisma.recurringBill.findFirst({ where: { id: billId, workspaceId }, select: billSelect })
  }

  async upsertMonth(
    workspaceId: string, billId: string, version: number, input: QaMonthInput,
  ): Promise<RecurringBillSummary | null> {
    return this.prisma.$transaction(async tx => {
      // Atualizar a versão do pai serializa mudanças simultâneas até na tabela filha.
      const updated = await tx.recurringBill.updateMany({
        where: { id: billId, workspaceId, version },
        data: { version: { increment: 1 } },
      })
      if (updated.count !== 1) {
        const exists = await tx.recurringBill.findFirst({
          where: { id: billId, workspaceId }, select: { id: true },
        })
        if (exists) throw new StaleFinancialRecordError()
        return null
      }
      const paidAt = input.status === 'PAID' ? new Date() : null
      await tx.monthlyBillEntry.upsert({
        where: { billId_yearMonth: { billId, yearMonth: input.yearMonth } },
        create: { billId, yearMonth: input.yearMonth, amountCents: input.amountCents, status: input.status, paidAt },
        update: { amountCents: input.amountCents, status: input.status, paidAt },
      })
      return tx.recurringBill.findFirst({ where: { id: billId, workspaceId }, select: billSelect })
    })
  }

  async removeMonth(
    workspaceId: string, billId: string, version: number, yearMonth: string,
  ): Promise<RecurringBillSummary | null> {
    return this.prisma.$transaction(async tx => {
      const updated = await tx.recurringBill.updateMany({
        where: { id: billId, workspaceId, version },
        data: { version: { increment: 1 } },
      })
      if (updated.count !== 1) {
        const exists = await tx.recurringBill.findFirst({
          where: { id: billId, workspaceId }, select: { id: true },
        })
        if (exists) throw new StaleFinancialRecordError()
        return null
      }
      const removed = await tx.monthlyBillEntry.deleteMany({ where: { billId, yearMonth } })
      if (removed.count !== 1) throw new QaBillMonthMissingError()
      return tx.recurringBill.findFirst({ where: { id: billId, workspaceId }, select: billSelect })
    })
  }

  async delete(workspaceId: string, billId: string, version: number): Promise<boolean> {
    // FK CASCADE apaga apenas entradas desta conta. Versão protege contra exclusão obsoleta.
    const removed = await this.prisma.recurringBill.deleteMany({
      where: { id: billId, workspaceId, version },
    })
    if (removed.count === 1) return true
    await this.staleOrMissing(workspaceId, billId)
    return false
  }
}
