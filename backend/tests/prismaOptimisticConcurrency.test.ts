import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { PrismaTransactionRepository } from '../src/infrastructure/repositories/PrismaTransactionRepository.js'
import { PrismaFinancialCatalogMutations } from '../src/infrastructure/repositories/PrismaFinancialCatalogMutations.js'
import { StaleFinancialRecordError } from '../src/domain/errors/StaleFinancialRecordError.js'
import type { CatalogKind, CatalogUpdate } from '../src/domain/repositories/FinancialCatalogMutations.js'

const space = '33333333-3333-4333-8333-333333333333'
const foreign = '44444444-4444-4444-8444-444444444444'
const id = '55555555-5555-4555-8555-555555555555'

function fakeTable() {
  const state = { version: 1, exists: true, updateCalls: [] as unknown[], deleteCalls: [] as unknown[] }
  const record = () => ({
    id, workspaceId: space, description: 'QA', category: 'QA', amountCents: 100,
    kind: 'EXPENSE', occurredOn: new Date('2026-11-09T00:00:00.000Z'),
    title: 'QA', name: 'QA', targetCents: 100, active: true, dueDay: 10,
    startMonth: '2026-11', endBeforeMonth: null, notes: '', status: 'PLANNING',
    version: state.version,
  })
  const inSpace = (where: { id: string; workspaceId: string }) =>
    state.exists && where.id === id && where.workspaceId === space
  const table = {
    async updateManyAndReturn(args: { where: { id: string; workspaceId: string; version: number }; data: { version?: {increment:number} } }) {
      state.updateCalls.push(args)
      if (!inSpace(args.where) || args.where.version !== state.version) return []
      if (args.data.version?.increment !== 1) throw Error('Missing version increment')
      state.version += 1
      return [record()]
    },
    async deleteMany(args: { where: { id: string; workspaceId: string; version: number } }) {
      state.deleteCalls.push(args)
      if (!inSpace(args.where) || args.where.version !== state.version) return { count: 0 }
      state.exists = false
      return { count: 1 }
    },
    async findFirst(args: { where: { id: string; workspaceId: string } }) {
      return inSpace(args.where) ? { id } : null
    },
  }
  return { table, state }
}

describe('Prisma CAS: updates são atômicos e preservam dados existentes', () => {
  it('Transação: somente versão mais recente altera, edição velha gera conflito', async () => {
    const { table, state } = fakeTable()
    const repository = new PrismaTransactionRepository({ transaction: table } as unknown as PrismaClient)
    const first = await repository.updateWithinWorkspace(space, id, { amountCents: 200 }, 1)
    expect(first?.version).toBe(2)
    await expect(repository.updateWithinWorkspace(space, id, { amountCents: 300 }, 1))
      .rejects.toBeInstanceOf(StaleFinancialRecordError)
    expect(state.version).toBe(2)
    const second = await repository.updateWithinWorkspace(space, id, { amountCents: 300 }, 2)
    expect(second?.version).toBe(3)
    expect(state.updateCalls).toHaveLength(3)
    await expect(repository.deleteWithinWorkspace(space, id, 2))
      .rejects.toBeInstanceOf(StaleFinancialRecordError)
    expect(await repository.deleteWithinWorkspace(space, id, 3)).toBe(true)
    expect(state.exists).toBe(false)
  })

  it('Transação alheia não revela existência nem permite alteração ou exclusão', async () => {
    const { table, state } = fakeTable()
    const repository = new PrismaTransactionRepository({ transaction: table } as unknown as PrismaClient)
    expect(await repository.updateWithinWorkspace(foreign, id, { amountCents: 999 }, 1)).toBeNull()
    expect(await repository.deleteWithinWorkspace(foreign, id, 1)).toBe(false)
    expect(state.version).toBe(1)
    expect(state.exists).toBe(true)
  })

  for (const kind of ['recurring-bills', 'fixed-expenses', 'budgets'] as const) {
    it(kind + ': updates condicionais, DELETE obsoleto e escopo do workspace', async () => {
      const { table, state } = fakeTable()
      const delegate = kind === 'recurring-bills' ? 'recurringBill' :
        kind === 'fixed-expenses' ? 'fixedExpense' : 'budgetProject'
      const repo = new PrismaFinancialCatalogMutations({ [delegate]: table } as unknown as PrismaClient)
      const input = {
        kind, workspaceId: space, id, expectedVersion: 1,
        data: kind === 'budgets' ? { title: 'QA novo' } : { name: 'QA novo' },
      } as CatalogUpdate
      const updated = await repo.update(input) as { version: number }
      expect(updated.version).toBe(2)
      await expect(repo.update(input)).rejects.toBeInstanceOf(StaleFinancialRecordError)
      expect(state.version).toBe(2)
      expect(await repo.update({ ...input, workspaceId: foreign })).toBeNull()
      expect(await repo.delete(kind as CatalogKind, foreign, id, 2)).toBe(false)
      await expect(repo.delete(kind as CatalogKind, space, id, 1))
        .rejects.toBeInstanceOf(StaleFinancialRecordError)
      expect(await repo.delete(kind as CatalogKind, space, id, 2)).toBe(true)
      expect(state.exists).toBe(false)
    })
  }
})
