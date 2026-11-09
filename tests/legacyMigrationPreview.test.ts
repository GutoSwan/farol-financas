import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLocalFinancialBackup } from '../src/application/use-cases/exportFinancialBackup'
import { analyzeLegacyMigration } from '../src/application/use-cases/analyzeLegacyMigration'

const data = new Map<string, string>()
beforeEach(() => {
  data.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  })
})

describe('Simulação segura da migração financeira local', () => {
  it('não altera os registros e não cria nada no banco', () => {
    const backup = buildLocalFinancialBackup()
    const previous = structuredClone(backup)
    const result = analyzeLegacyMigration(backup, [])
    expect(result.blockers).toBe(0)
    expect(result.warnings).toBe(0)
    expect(result.readyForImportDesign).toBe(true)
    expect(result.total.spaces).toBe(1)
    expect(result.requiresRemapping).toBe(1)
    expect(result.cloudComparison).toBe('workspace-names-only')
    expect(data.size).toBe(0)
    expect(backup).toEqual(previous)
  })

  it('bloqueia importação cega de espaços com nomes iguais na nuvem', () => {
    const backup = buildLocalFinancialBackup()
    const result = analyzeLegacyMigration(backup, [{
      id: '33333333-3333-4333-8333-333333333333',
      name: '  GUSTAVO   E ANA  ',
      role: 'OWNER',
    }])
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ONLINE_NAME_CONFLICT', severity: 'blocker' }),
    ]))
    expect(result.readyForImportDesign).toBe(false)
  })

  it('detecta histórico mensal órfão, duplicado, valores incompatíveis e lançamentos inválidos', () => {
    const backup = buildLocalFinancialBackup()
    const space = backup.workspaces[0]
    space.bills.push({ id: 'energia', name: 'Energia', dueDay: 12, active: true, createdAt: '2026-11-09' })
    space.monthlyEntries.push(
      { id: 'entry1', billId: 'energia', yearMonth: '2026-11', amountCents: 1000, status: 'paid', paidAt: null },
      { id: 'entry2', billId: 'energia', yearMonth: '2026-11', amountCents: 2000, status: 'pending', paidAt: null },
      { id: 'entry3', billId: 'sem-conta', yearMonth: '2026-11', amountCents: 300, status: 'pending', paidAt: null },
    )
    space.transactions.push({
      id: 't1', description: 'Mercado', amountCents: 1000, category: 'Alimentação',
      kind: 'expense', occurredOn: '2026-02-30', createdAt: '2026-11-09',
      budgetProjectId: 'inexistente',
    })
    const result = analyzeLegacyMigration(backup, [])
    expect(result.blockers).toBeGreaterThanOrEqual(4)
    for (const code of ['ORPHAN_MONTHLY_ENTRY', 'DUPLICATED_MONTH', 'INVALID_TRANSACTION',
      'ORPHAN_TRANSACTION_PROJECT']) {
      expect(result.issues.map(issue => issue.code)).toContain(code)
    }
    expect(result.issues.map(issue => issue.code)).toContain('MISSING_PAYMENT_TIME')
    expect(result.readyForImportDesign).toBe(false)
  })

  it('detecta vínculos inválidos entre projetos, itens e cotações', () => {
    const backup = buildLocalFinancialBackup()
    const space = backup.workspaces[0]
    space.budgets.projects.push({
      id: 'projeto1', title: 'Reforma', category: 'Casa', targetCents: 300_000,
      status: 'planning', notes: '', createdAt: '2026-11-09',
    })
    space.budgets.items.push({ id: 'item1', projectId: 'nao-existe', title: 'Tinta',
      plannedCents: 1000, createdAt: '2026-11-09' })
    space.budgets.quotes.push({
      id: 'q1', itemId: 'outro', provider: 'Loja', amountCents: 1300,
      estimatedDays: null, materialsIncluded: false, notes: '', selected: false,
      createdAt: '2026-11-09',
    })
    const result = analyzeLegacyMigration(backup, [])
    expect(result.issues.map(issue => issue.code)).toContain('ORPHAN_BUDGET_ITEM')
    expect(result.issues.map(issue => issue.code)).toContain('ORPHAN_QUOTE')
    expect(result.requiresRemapping).toBe(4)
  })

  it('não inventa data de quitação nos gastos fixos', () => {
    const backup = buildLocalFinancialBackup()
    backup.workspaces[0].fixedExpenses.push({
      id: 'aluguel', name: 'Aluguel', amountCents: 150000, dueDay: 10,
      startMonth: '2026-01', endBeforeMonth: null,
      paidMonths: ['2026-10'], createdAt: '2026-01-01',
    })
    const result = analyzeLegacyMigration(backup, [])
    expect(result.blockers).toBe(0)
    expect(result.warnings).toBe(1)
    expect(result.issues[0].code).toBe('FIXED_PAYMENT_DATES_UNKNOWN')
  })

  it('limita o relatório visível para não travar a interface', () => {
    const backup = buildLocalFinancialBackup()
    for (let i = 0; i < 120; i++) {
      backup.workspaces[0].bills.push({
        id: 'b' + i, name: 'Conta', dueDay: 0, active: true, createdAt: '2026-11-09',
      })
    }
    const result = analyzeLegacyMigration(backup, [])
    expect(result.blockers).toBe(120)
    expect(result.issues).toHaveLength(80)
    expect(result.truncated).toBe(true)
  })

  it('recusa resposta de espaços da nuvem fora do contrato esperado', () => {
    const backup = buildLocalFinancialBackup()
    expect(() => analyzeLegacyMigration(backup, [
      { id: '', name: 'Inconsistente', role: 'OWNER' },
    ])).toThrow('dados inesperados')
  })
})
