import type { PrismaClient } from '@prisma/client'
import type { CatalogCreate, CatalogUpdate, CatalogKind, FinancialCatalogMutations } from '../../domain/repositories/FinancialCatalogMutations.js'

/** Todas as mutações alteram apenas registros do espaço autorizado na rota. */
export class PrismaFinancialCatalogMutations implements FinancialCatalogMutations {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CatalogCreate): Promise<unknown> {
    switch (input.kind) {
      case 'recurring-bills':
        return this.prisma.recurringBill.create({
          data: { workspaceId: input.workspaceId, ...input.data },
          select: { id: true, workspaceId: true, name: true, dueDay: true, active: true },
        })
      case 'fixed-expenses':
        return this.prisma.fixedExpense.create({
          data: { workspaceId: input.workspaceId, ...input.data },
          select: { id: true, workspaceId: true, name: true, amountCents: true, dueDay: true, startMonth: true, endBeforeMonth: true },
        })
      case 'budgets':
        return this.prisma.budgetProject.create({
          data: { workspaceId: input.workspaceId, ...input.data },
          select: { id: true, workspaceId: true, title: true, category: true, targetCents: true, status: true, notes: true },
        })
    }
  }

  async update(input: CatalogUpdate): Promise<unknown | null> {
    const where = { id: input.id, workspaceId: input.workspaceId }
    switch (input.kind) {
      case 'recurring-bills': {
        const changed = await this.prisma.recurringBill.updateMany({ where, data: input.data })
        if (changed.count !== 1) return null
        return this.prisma.recurringBill.findFirst({
          where, select: { id: true, workspaceId: true, name: true, dueDay: true, active: true },
        })
      }
      case 'fixed-expenses': {
        const changed = await this.prisma.fixedExpense.updateMany({ where, data: input.data })
        if (changed.count !== 1) return null
        return this.prisma.fixedExpense.findFirst({
          where, select: { id: true, workspaceId: true, name: true, amountCents: true, dueDay: true, startMonth: true, endBeforeMonth: true },
        })
      }
      case 'budgets': {
        const changed = await this.prisma.budgetProject.updateMany({ where, data: input.data })
        if (changed.count !== 1) return null
        return this.prisma.budgetProject.findFirst({
          where, select: { id: true, workspaceId: true, title: true, category: true, targetCents: true, status: true, notes: true },
        })
      }
    }
  }

  async delete(kind: CatalogKind, workspaceId: string, id: string): Promise<boolean> {
    const where = { id, workspaceId }
    switch (kind) {
      case 'recurring-bills':
        return (await this.prisma.recurringBill.deleteMany({ where })).count === 1
      case 'fixed-expenses':
        return (await this.prisma.fixedExpense.deleteMany({ where })).count === 1
      case 'budgets':
        return (await this.prisma.budgetProject.deleteMany({ where })).count === 1
    }
  }
}
