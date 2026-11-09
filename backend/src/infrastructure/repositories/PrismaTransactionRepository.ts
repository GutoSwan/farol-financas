import type { PrismaClient } from '@prisma/client'
import type { NewTransaction, TransactionChanges, TransactionEntry, TransactionRepository } from '../../domain/repositories/TransactionRepository.js'
import { StaleFinancialRecordError } from '../../domain/errors/StaleFinancialRecordError.js'

function toEntry(item: { id: string; workspaceId: string; description: string; category: string; amountCents: number; kind: 'EXPENSE'|'INCOME'; occurredOn: Date; version: number }): TransactionEntry {
  return {
    id: item.id, workspaceId: item.workspaceId, description: item.description,
    category: item.category, amountCents: item.amountCents, kind: item.kind,
    occurredOn: item.occurredOn.toISOString().slice(0, 10), version: item.version,
  }
}

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listForWorkspace(workspaceId: string, limit: number): Promise<TransactionEntry[]> {
    const records = await this.prisma.transaction.findMany({
      where: { workspaceId }, // Impedir varredura entre espaços mesmo após autorização.
      select: { id: true, workspaceId: true, description: true, category: true, amountCents: true, kind: true, occurredOn: true, version: true },
      orderBy: [{ occurredOn: 'desc' }, { id: 'desc' }],
      take: limit,
    })
    return records.map(toEntry)
  }

  async createForWorkspace(entry: NewTransaction): Promise<TransactionEntry> {
    const saved = await this.prisma.transaction.create({
      data: { workspaceId: entry.workspaceId, description: entry.description,
        category: entry.category, amountCents: entry.amountCents,
        kind: entry.kind, occurredOn: new Date(entry.occurredOn + 'T00:00:00.000Z') },
      select: { id: true, workspaceId: true, description: true, category: true, amountCents: true, kind: true, occurredOn: true, version: true },
    })
    return toEntry(saved)
  }

  async updateWithinWorkspace(
    workspaceId: string, transactionId: string, changes: TransactionChanges, expectedVersion: number,
  ): Promise<TransactionEntry | null> {
    const data = {
      ...changes,
      ...(changes.occurredOn === undefined ? {} : { occurredOn: new Date(changes.occurredOn + 'T00:00:00.000Z') }),
      version: { increment: 1 },
    }
    // Uma única operação atômica compara ID + workspace + versão ANTES de gravar.
    // updateManyAndReturn devolve exatamente a versão efetivamente escrita.
    const updated = await this.prisma.transaction.updateManyAndReturn({
      where: { id: transactionId, workspaceId, version: expectedVersion },
      data,
      select: {
        id: true, workspaceId: true, description: true, category: true,
        amountCents: true, kind: true, occurredOn: true, version: true,
      },
    })
    if (updated.length === 1) return toEntry(updated[0])
    // Nunca revelar registro de outro espaço.
    const exists = await this.prisma.transaction.findFirst({
      where: { id: transactionId, workspaceId }, select: { id: true },
    })
    if (exists) throw new StaleFinancialRecordError()
    return null
  }

  async deleteWithinWorkspace(workspaceId: string, transactionId: string, expectedVersion: number): Promise<boolean> {
    const deleted = await this.prisma.transaction.deleteMany({
      where: { id: transactionId, workspaceId, version: expectedVersion },
    })
    if (deleted.count === 1) return true
    const exists = await this.prisma.transaction.findFirst({
      where: { id: transactionId, workspaceId }, select: { id: true },
    })
    if (exists) throw new StaleFinancialRecordError()
    return false
  }
}
