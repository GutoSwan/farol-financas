import { describe, expect, it, beforeEach } from 'vitest'
import { BrowserBillRepository, billsStorageKey } from '../src/infrastructure/persistence/BrowserBillRepository'
import { BrowserWorkspaceRepository } from '../src/infrastructure/persistence/BrowserWorkspaceRepository'
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

describe('Espaços financeiros locais', () => {
  it('preserva os dados anteriores no espaço padrão', () => {
    expect(billsStorageKey(DEFAULT_WORKSPACE_ID)).toBe('farol-financas:dev:v1')
    data.set('farol-financas:dev:v1', JSON.stringify({
      bills: [{ id: 'energia', name: 'Energia', dueDay: 10, active: true, createdAt: '2026-10-29' }],
      entries: [],
    }))
    expect(new BrowserBillRepository(DEFAULT_WORKSPACE_ID).listBills()).toHaveLength(1)
  })

  it('mantém valores de espaços distintos separados', () => {
    const workspaceRepository = new BrowserWorkspaceRepository()
    const friend = workspaceRepository.create('Amigo')
    const homeBills = new BrowserBillRepository(DEFAULT_WORKSPACE_ID)
    const friendBills = new BrowserBillRepository(friend.id)
    homeBills.saveBill({ id: '1', name: 'Água', dueDay: 10, active: true, createdAt: '2026-10-29' })
    expect(friendBills.listBills()).toHaveLength(0)
    friendBills.saveBill({ id: '2', name: 'Internet', dueDay: 5, active: true, createdAt: '2026-10-29' })
    expect(homeBills.listBills()).toHaveLength(1)
    expect(homeBills.listBills()[0].name).toBe('Água')
    expect(friendBills.listBills()[0].name).toBe('Internet')
  })

  it('retém o espaço selecionado ao abrir novamente', () => {
    const repository = new BrowserWorkspaceRepository()
    const item = repository.create('Finanças do João')
    repository.select(item.id)
    expect(new BrowserWorkspaceRepository().getActiveId()).toBe(item.id)
  })

  it('rejeita nomes duplicados e espaços inexistentes', () => {
    const repository = new BrowserWorkspaceRepository()
    repository.create('Amigo')
    expect(() => repository.create('amigo')).toThrow()
    expect(() => repository.select('inexistente')).toThrow()
  })
})
