import type { PrismaClient } from '@prisma/client'
import type { NewTransaction, TransactionEntry, TransactionRepository } from '../../domain/repositories/TransactionRepository.js'

function toEntry(item: { id: string; workspaceId: string; description: string; category: string; amountCents: number; kind: 'EXPENSE'|'INCOME'; occurredOn: Date }): TransactionEntry {
  return {
    id: item.id, workspaceId: item.workspaceId, description: item.description,
    category: item.category, amountCents: item.amountCents, kind: item.kind,
    occurredOn: item.occurredOn.toISOString().slice(0, 10),
  }
}

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listForWorkspace(workspaceId: string, limit: number): Promise<TransactionEntry[]> {
    const records = await this.prisma.transaction.findMany({
      where: { workspaceId }, // Impedir varredura entre espaços mesmo após autorização.
      select: { id: true, workspaceId: true, description: true, category: true, amountCents: true, kind: true, occurredOn: true },
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
      select: { id: true, workspaceId: true, description: true, category: true, amountCents: true, kind: true, occurredOn: true },
    })
    return toEntry(saved)
  }
}
