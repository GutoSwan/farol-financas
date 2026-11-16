import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserWorkspaceRepository, WORKSPACES_KEY } from '../src/infrastructure/persistence/BrowserWorkspaceRepository'
import { BrowserTransactionRepository } from '../src/infrastructure/persistence/BrowserTransactionRepository'
import { DEFAULT_WORKSPACE_ID, VALORA3D_WORKSPACE_ID } from '../src/domain/entities/FinancialWorkspace'

const storage = new Map<string, string>()
beforeEach(() => {
  storage.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
  })
})

describe('Valora3D como espaço familiar separado', () => {
  it('oferece casa e Valora3D sem apagar ou reescrever dados locais', () => {
    const repo = new BrowserWorkspaceRepository()
    const before = new Map(storage)
    expect(repo.list().map(w => [w.id, w.name])).toEqual([
      [DEFAULT_WORKSPACE_ID, 'Gustavo e Ana'],
      [VALORA3D_WORKSPACE_ID, 'Valora3D'],
    ])
    expect(storage).toEqual(before)
    expect(() => repo.create('Valora 3D')).toThrow('Já existe um espaço')
    expect(() => repo.delete(VALORA3D_WORKSPACE_ID)).toThrow('protegidos')
  })

  it('preserva o ID de uma Valora3D já criada e seus lançamentos', () => {
    const oldId = 'valora3d-anterior'
    storage.set(WORKSPACES_KEY, JSON.stringify([
      { id: oldId, name: 'Valora3D', createdAt: '2026-11-01T00:00:00.000Z' },
    ]))
    const transaction = {
      id: 'lancamento1', description: 'Filamento', amountCents: 9000,
      category: 'Material', kind: 'expense', occurredOn: '2026-11-13',
      createdAt: '2026-11-13T00:00:00.000Z',
    } as const
    new BrowserTransactionRepository(oldId).save(transaction)
    const before = new Map(storage)
    const repo = new BrowserWorkspaceRepository()
    expect(repo.list()).toHaveLength(2)
    expect(repo.list()[1].id).toBe(oldId)
    expect(new BrowserTransactionRepository(repo.list()[1].id).list()).toEqual([transaction])
    expect(storage).toEqual(before)
    expect(() => repo.delete(oldId)).toThrow('protegidos')
  })

  it('trocar de espaço mantém lançamentos domésticos separados dos empresariais', () => {
    const home = new BrowserTransactionRepository(DEFAULT_WORKSPACE_ID)
    const valora = new BrowserTransactionRepository(VALORA3D_WORKSPACE_ID)
    valora.save({
      id: 'tx-1', description: 'Venda Valora', amountCents: 15000,
      category: 'Vendas', kind: 'income', occurredOn: '2026-11-16',
      createdAt: '2026-11-16T00:00:00.000Z',
    })
    expect(home.list()).toEqual([])
    expect(valora.list()).toHaveLength(1)
  })
})
