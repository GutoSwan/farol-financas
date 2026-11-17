import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKSPACE } from '../src/domain/entities/FinancialWorkspace'
import { inspectMigrationSource } from '../src/application/use-cases/inspectMigrationSource'
import type { FinancialBackup } from '../src/infrastructure/backup/encryptedFinancialBackup'

function fixture(): FinancialBackup {
  return {
    format: 'farol-financas-local-backup', version: 1,
    exportedAt: '2026-11-17T12:00:00.000Z',
    activeWorkspaceId: DEFAULT_WORKSPACE.id,
    workspaces: [{
      workspace: { ...DEFAULT_WORKSPACE },
      bills: [], monthlyEntries: [], fixedExpenses: [], transactions: [],
      budgets: { projects: [], items: [], quotes: [] },
    }],
  }
}

describe('Pré-validação de segurança antes da transferência de registros', () => {
  it('aceita um espaço consistente sem modificar o backup', () => {
    const backup = fixture()
    const before = JSON.stringify(backup)
    expect(inspectMigrationSource(backup, DEFAULT_WORKSPACE.id)).toEqual([])
    expect(JSON.stringify(backup)).toBe(before)
  })

  it('bloqueia valor superior ao limite da API e data inexistente', () => {
    const backup = fixture()
    backup.workspaces[0].transactions.push({
      id: 'tx1', description: 'Teste', category: 'Geral', amountCents: 2_147_483_648,
      kind: 'expense', occurredOn: '2026-02-30', createdAt: '2026-11-17',
    })
    const problems = inspectMigrationSource(backup, DEFAULT_WORKSPACE.id)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join()).toMatch(/valor|data|lançamento/i)
  })

  it('bloqueia conta mensal com vencimento inválido', () => {
    const backup = fixture()
    backup.workspaces[0].bills.push({
      id: 'b1', name: 'Luz', dueDay: 35, active: true, createdAt: '2026-11-17',
    })
    expect(inspectMigrationSource(backup, DEFAULT_WORKSPACE.id).join())
      .toMatch(/conta|vencimento/i)
  })

  it('recusa origem ausente, sem gravar ou apagar dados', () => {
    expect(inspectMigrationSource(fixture(), 'outro-espaco')).toEqual([
      'O espaço local selecionado não foi encontrado. Atualize a revisão.',
    ])
  })
})
