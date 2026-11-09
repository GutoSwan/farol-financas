import type { PrismaClient } from '@prisma/client'
import type { CatalogCreate, CatalogUpdate, CatalogKind, FinancialCatalogMutations } from '../../domain/repositories/FinancialCatalogMutations.js'
import { StaleFinancialRecordError } from '../../domain/errors/StaleFinancialRecordError.js'

/** Cada alteração é atômica, sempre limitada a id + workspaceId + version.
 * Um conflito só é reportado quando o registro EXISTE no mesmo workspace.
 */
export class PrismaFinancialCatalogMutations implements FinancialCatalogMutations {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CatalogCreate): Promise<unknown> {
    switch (input.kind) {
      case 'recurring-bills':
        return this.prisma.recurringBill.create({
          data: { workspaceId: input.workspaceId, ...input.data },
          select: { id: true, workspaceId: true, name: true, dueDay: true, active: true, version: true },
        })
      case 'fixed-expenses':
        return this.prisma.fixedExpense.create({
          data: { workspaceId: input.workspaceId, ...input.data },
          select: { id: true, workspaceId: true, name: true, amountCents: true, dueDay: true, startMonth: true, endBeforeMonth: true, version: true },
        })
      case 'budgets':
        return this.prisma.budgetProject.create({
          data: { workspaceId: input.workspaceId, ...input.data },
          select: { id: true, workspaceId: true, title: true, category: true, targetCents: true, status: true, notes: true, version: true },
        })
    }
  }

  async update(input: CatalogUpdate): Promise<unknown | null> {
    const where = { id: input.id, workspaceId: input.workspaceId, version: input.expectedVersion }
    const data = { ...input.data, version: { increment: 1 } }
    switch (input.kind) {
      case 'recurring-bills': {
        const rows = await this.prisma.recurringBill.updateManyAndReturn({
          where, data,
          select: { id: true, workspaceId: true, name: true, dueDay: true, active: true, version: true },
        })
        if (rows.length === 1) return rows[0]
        const exists = await this.prisma.recurringBill.findFirst({
          where: { id: input.id, workspaceId: input.workspaceId }, select: { id: true },
        })
        if (exists) throw new StaleFinancialRecordError()
        return null
      }
      case 'fixed-expenses': {
        const rows = await this.prisma.fixedExpense.updateManyAndReturn({
          where, data,
          select: { id: true, workspaceId: true, name: true, amountCents: true, dueDay: true, startMonth: true, endBeforeMonth: true, version: true },
        })
        if (rows.length === 1) return rows[0]
        const exists = await this.prisma.fixedExpense.findFirst({
          where: { id: input.id, workspaceId: input.workspaceId }, select: { id: true },
        })
        if (exists) throw new StaleFinancialRecordError()
        return null
      }
      case 'budgets': {
        const rows = await this.prisma.budgetProject.updateManyAndReturn({
          where, data,
          select: { id: true, workspaceId: true, title: true, category: true, targetCents: true, status: true, notes: true, version: true },
        })
        if (rows.length === 1) return rows[0]
        const exists = await this.prisma.budgetProject.findFirst({
          where: { id: input.id, workspaceId: input.workspaceId }, select: { id: true },
        })
        if (exists) throw new StaleFinancialRecordError()
        return null
      }
    }
  }

  async delete(kind: CatalogKind, workspaceId: string, id: string, expectedVersion: number): Promise<boolean> {
    const where = { id, workspaceId, version: expectedVersion }
    let deleted: { count: number }
    let exists: { id: string } | null
    switch (kind) {
      case 'recurring-bills':
        deleted = await this.prisma.recurringBill.deleteMany({ where })
        if (deleted.count === 1) return true
        exists = await this.prisma.recurringBill.findFirst({ where: { id, workspaceId }, select: { id: true } })
        break
      case 'fixed-expenses':
        deleted = await this.prisma.fixedExpense.deleteMany({ where })
        if (deleted.count === 1) return true
        exists = await this.prisma.fixedExpense.findFirst({ where: { id, workspaceId }, select: { id: true } })
        break
      case 'budgets':
        deleted = await this.prisma.budgetProject.deleteMany({ where })
        if (deleted.count === 1) return true
        exists = await this.prisma.budgetProject.findFirst({ where: { id, workspaceId }, select: { id: true } })
        break
    }
    if (exists) throw new StaleFinancialRecordError()
    return false
  }
}
