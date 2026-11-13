import type { PrismaClient } from '@prisma/client'
import {
  LegacyReadinessForbiddenError,
  type LegacyReadiness,
  type LegacyReadinessInspector,
  type LegacyReadinessCounts,
} from '../../application/use-cases/LegacyReadinessInspector.js'

/**
 * A contagem acontece na MESMA fotografia de banco, evitando interpretar
 * registros filhas invisíveis em listas paginadas como um workspace vazio.
 * Não executa escrita, não recebe dados locais nem retorna conteúdos.
 */
export class PrismaLegacyReadinessInspector implements LegacyReadinessInspector {
  constructor(private readonly prisma: PrismaClient) {}

  async inspect(ownerUserId: string, workspaceId: string): Promise<LegacyReadiness> {
    const counts = await this.prisma.$transaction(async tx => {
      // Revalidar pertencimento no próprio snapshot, evitando TOCTOU da rota.
      const member = await tx.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: ownerUserId, workspaceId } },
        select: { role: true },
      })
      if (member?.role !== 'OWNER') throw new LegacyReadinessForbiddenError()
      const [
        transactions, recurringBills, monthlyEntries, fixedExpenses, fixedPayments,
        budgetProjects, budgetItems, budgetQuotes, legacyMappings,
      ] = await Promise.all([
        tx.transaction.count({ where: { workspaceId } }),
        tx.recurringBill.count({ where: { workspaceId } }),
        tx.monthlyBillEntry.count({ where: { bill: { workspaceId } } }),
        tx.fixedExpense.count({ where: { workspaceId } }),
        tx.fixedExpensePayment.count({ where: { fixedExpense: { workspaceId } } }),
        tx.budgetProject.count({ where: { workspaceId } }),
        tx.budgetItem.count({ where: { project: { workspaceId } } }),
        tx.budgetQuote.count({ where: { item: { project: { workspaceId } } } }),
        // Um mapeamento de QUALQUER titular ocupa o destino.
        tx.legacyImportMapping.count({ where: { workspaceId } }),
      ])
      return {
        transactions, recurringBills, monthlyEntries, fixedExpenses, fixedPayments,
        budgetProjects, budgetItems, budgetQuotes, legacyMappings,
      } satisfies LegacyReadinessCounts
    }, { isolationLevel: 'RepeatableRead' })
    if (!Object.values(counts).every(c => Number.isSafeInteger(c) && c >= 0)) {
      throw new Error('Inventário remoto inválido.')
    }
    const state = counts.legacyMappings > 0 ? 'mapped' :
      Object.values(counts).some(c => c > 0) ? 'occupied' : 'empty'
    return { workspaceId, counts, state, exact: true }
  }
}
