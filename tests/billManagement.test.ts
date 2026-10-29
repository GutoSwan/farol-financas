import { beforeEach, describe, expect, it } from 'vitest'
import { BrowserBillRepository } from '../src/infrastructure/persistence/BrowserBillRepository'
import { deleteRecurringBill, setRecurringBillActive, updateRecurringBill } from '../src/application/use-cases/manageRecurringBill'
import { registerMonthlyBill } from '../src/application/use-cases/registerMonthlyBill'

const storage = new Map<string, string>()
beforeEach(() => {
  storage.clear()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
  } })
})

function seed(repository: BrowserBillRepository) {
  repository.saveBill({ id: 'energia', name: 'Energia', dueDay: 10, active: true, createdAt: '2026-10-01' })
  repository.upsertEntry({ id: 'set', billId: 'energia', yearMonth: '2026-09', amountCents: 18000, status: 'paid', paidAt: null })
  repository.upsertEntry({ id: 'out', billId: 'energia', yearMonth: '2026-10', amountCents: 20000, status: 'pending', paidAt: null })
}

describe('Gerenciar contas mensais', () => {
  it('edita o cadastro sem duplicar a conta nem modificar o histórico', () => {
    const repo = new BrowserBillRepository('household-default')
    seed(repo)
    updateRecurringBill(repo, 'energia', 'Energia elétrica', 12)
    expect(repo.listBills()).toHaveLength(1)
    expect(repo.listBills()[0].name).toBe('Energia elétrica')
    expect(repo.listBills()[0].dueDay).toBe(12)
    expect(repo.listEntries()).toHaveLength(2)
  })

  it('arquiva sem apagar o histórico e permite reativar', () => {
    const repo = new BrowserBillRepository('household-default')
    seed(repo)
    setRecurringBillActive(repo, 'energia', false)
    expect(repo.listEntries()).toHaveLength(2)
    expect(() => registerMonthlyBill(repo, 'energia', '2026-11', 21000, 'pending')).toThrow()
    setRecurringBillActive(repo, 'energia', true)
    registerMonthlyBill(repo, 'energia', '2026-11', 21000, 'pending')
    expect(repo.listEntries()).toHaveLength(3)
  })

  it('exclui cadastro e histórico vinculado, mas preserva outras contas e espaços', () => {
    const repo = new BrowserBillRepository('household-default')
    const friend = new BrowserBillRepository('friend-a')
    seed(repo)
    repo.saveBill({ id: 'agua', name: 'Água', dueDay: 10, active: true, createdAt: '2026-10-01' })
    friend.saveBill({ id: 'energia', name: 'Energia do amigo', dueDay: 15, active: true, createdAt: '2026-10-01' })
    deleteRecurringBill(repo, 'energia')
    expect(repo.listBills().map(b => b.id)).toEqual(['agua'])
    expect(repo.listEntries()).toHaveLength(0)
    expect(friend.listBills()).toHaveLength(1)
  })

  it('não remove registro de outra conta com ID inválido', () => {
    const repo = new BrowserBillRepository('household-default')
    seed(repo)
    expect(() => deleteRecurringBill(repo, 'inexistente')).toThrow()
    expect(repo.listBills()).toHaveLength(1)
  })
})
