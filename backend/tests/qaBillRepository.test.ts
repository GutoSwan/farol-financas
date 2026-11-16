import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { PrismaQaBillRepository } from '../src/infrastructure/repositories/PrismaQaBillRepository.js'
import { StaleFinancialRecordError } from '../src/domain/errors/StaleFinancialRecordError.js'
import { QaBillMonthMissingError } from '../src/domain/repositories/QaBillRepository.js'

const workspaceId = '01c6765f-b873-420f-a5f2-68c54aa22500'
const billId = '55555555-5555-4555-8555-555555555555'
const bill = { id: billId, workspaceId, version: 3, name: 'QA Luz', dueDay: 10, active: true, entries: [] }
function fixture(updatedCount = 1, removedCount = 1, exists = true) {
  const updateMany = vi.fn().mockResolvedValue({ count: updatedCount })
  const upsert = vi.fn().mockResolvedValue({ id: '77777777-7777-4777-8777-777777777777' })
  const deleteMany = vi.fn().mockResolvedValue({ count: removedCount })
  const findFirst = vi.fn().mockResolvedValue(exists ? bill : null)
  const tx = { recurringBill: { updateMany, findFirst }, monthlyBillEntry: { upsert, deleteMany } }
  type MockTx = typeof tx
  const prisma = { $transaction: vi.fn(async (fn: (client: MockTx) => Promise<unknown>) => fn(tx)) } as unknown as PrismaClient
  return { repository: new PrismaQaBillRepository(prisma), updateMany, upsert, deleteMany, findFirst }
}
describe('Contas mensais QA: concorrência e escopo no repositório', () => {
  it('incrementa a versão do pai ANTES da gravação do mês e usa chave composta', async () => {
    const { repository, updateMany, upsert } = fixture()
    await repository.upsertMonth(workspaceId, billId, 2, { yearMonth: '2026-11', amountCents: 1234, status: 'PAID' })
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: billId, workspaceId, version: 2 },
      data: { version: { increment: 1 } },
    })
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { billId_yearMonth: { billId, yearMonth: '2026-11' } },
      update: expect.objectContaining({ amountCents: 1234, status: 'PAID' }),
    }))
  })
  it('não atualiza o mês após detectar versão antiga', async () => {
    const { repository, upsert } = fixture(0, 1, true)
    await expect(repository.upsertMonth(workspaceId, billId, 2, {
      yearMonth: '2026-11', amountCents: 1234, status: 'PENDING',
    })).rejects.toBeInstanceOf(StaleFinancialRecordError)
    expect(upsert).not.toHaveBeenCalled()
  })
  it('não escreve em conta de outro espaço e não revela sua existência', async () => {
    const { repository, upsert } = fixture(0, 1, false)
    const result = await repository.upsertMonth(workspaceId, billId, 2, {
      yearMonth: '2026-11', amountCents: 1234, status: 'PENDING',
    })
    expect(result).toBeNull()
    expect(upsert).not.toHaveBeenCalled()
  })
  it('excluir mês inexistente falha para reverter a transação', async () => {
    const { repository, deleteMany } = fixture(1, 0)
    await expect(repository.removeMonth(workspaceId, billId, 2, '2026-11'))
      .rejects.toBeInstanceOf(QaBillMonthMissingError)
    expect(deleteMany).toHaveBeenCalledWith({ where: { billId, yearMonth: '2026-11' } })
  })
})
