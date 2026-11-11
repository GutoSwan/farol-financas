import { beforeEach, describe, expect, it } from 'vitest'
import { buildLocalFinancialBackup } from '../src/application/use-cases/exportFinancialBackup'
import { BrowserWorkspaceRepository } from '../src/infrastructure/persistence/BrowserWorkspaceRepository'
import { BrowserBillRepository } from '../src/infrastructure/persistence/BrowserBillRepository'
import { BrowserGiftRepository } from '../src/infrastructure/persistence/BrowserGiftRepository'
import { DEFAULT_WORKSPACE_ID } from '../src/domain/entities/FinancialWorkspace'

const data = new Map<string, string>()
beforeEach(() => {
  data.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value) },
      removeItem: (key: string) => { data.delete(key) },
    },
  })
})

describe('Backup financeiro local antes da migração', () => {
  it('exporta o espaço inicial e outros espaços sem apagar nem alterar registros', () => {
    const repository = new BrowserWorkspaceRepository()
    const second = repository.create('Meu segundo espaço')
    const bill = new BrowserBillRepository(second.id)
    bill.saveBill({
      id: 'conta-2', name: 'Internet', dueDay: 10, active: true,
      createdAt: '2026-11-06T00:00:00.000Z',
    })
    const previousData = new Map(data)
    const result = buildLocalFinancialBackup()
    expect(result.format).toBe('farol-financas-local-backup')
    expect(result.version).toBe(1)
    expect(result.workspaces.map(x => x.workspace.id)).toEqual([DEFAULT_WORKSPACE_ID, second.id])
    expect(result.workspaces.find(x => x.workspace.id === second.id)?.bills[0].name).toBe('Internet')
    expect(data).toEqual(previousData)
  })

  it('não exporta presentes, chaves de sessão ou segredos', () => {
    const gifts = new BrowserGiftRepository('11111111-1111-4111-8111-111111111111')
    gifts.add('gustavo', { name: 'Presente secreto', priceCents: 25000, priority: 'high', productUrl: '' })
    data.set('sb-test-auth-token', 'super-secret-token')
    const result = JSON.stringify(buildLocalFinancialBackup())
    expect(result).not.toContain('Presente secreto')
    expect(result).not.toContain('super-secret-token')
    expect(result).toContain('monthlyEntries')
    expect(result).toContain('fixedExpenses')
    expect(result).toContain('transactions')
    expect(result).toContain('budgets')
  })

  it('não sobrescreve dados quando um armazenamento financeiro está corrompido', () => {
    const key = 'farol-financas:dev:v1'
    data.set(key, '{corrompido')
    expect(() => buildLocalFinancialBackup()).toThrow()
    expect(data.get(key)).toBe('{corrompido')
  })
})
