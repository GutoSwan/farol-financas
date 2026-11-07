import type { PrismaClient } from '@prisma/client'
import type { FinancialCatalogRepository } from '../../domain/repositories/FinancialCatalogRepository.js'

/** Todas as queries filtram workspaceId, mesmo após checagem de associação na API. */
export class PrismaFinancialCatalogRepository implements FinancialCatalogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listRecurringBills(workspaceId: string, limit: number) {
    return this.prisma.recurringBill.findMany({
      where: { workspaceId },
      select: { id: true, workspaceId: true, name: true, dueDay: true, active: true },
      orderBy: [{ dueDay: 'asc' }, { id: 'asc' }],
      take: limit,
    })
  }

  async listFixedExpenses(workspaceId: string, limit: number) {
    return this.prisma.fixedExpense.findMany({
      where: { workspaceId },
      select: {
        id: true, workspaceId: true, name: true, amountCents: true, dueDay: true,
        startMonth: true, endBeforeMonth: true,
      },
      orderBy: [{ dueDay: 'asc' }, { id: 'asc' }],
      take: limit,
    })
  }

  async listBudgets(workspaceId: string, limit: number) {
    return this.prisma.budgetProject.findMany({
      where: { workspaceId },
      select: { id: true, workspaceId: true, title: true, category: true, targetCents: true, status: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    })
  }
}
