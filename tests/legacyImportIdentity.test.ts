import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLocalFinancialBackup } from '../src/application/use-cases/exportFinancialBackup'
import { planLegacyIdentifiers } from '../src/application/use-cases/planLegacyIdentifiers'

const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const saved = new Map<string, string>()

beforeEach(() => {
  saved.clear()
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { saved.set(key, value) },
    removeItem: (key: string) => { saved.delete(key) },
  })
})

describe('Identidades legadas para uma futura migração segura', () => {
  it('usa as mesmas chaves após repetir o plano, sem gravar no navegador', async () => {
    const backup = buildLocalFinancialBackup()
    const first = await planLegacyIdentifiers(backup, alice)
    const second = await planLegacyIdentifiers(backup, alice)
    expect(first).toEqual(second)
    expect(first.records).toHaveLength(1)
    expect(first.records[0].type).toBe('workspace')
    expect(first.records[0].sourceKey).toHaveLength(64)
    expect(saved.size).toBe(0)
  })

  it('separa os IDs de dois titulares e detecta alterações de valores com mesmo ID', async () => {
    const backup = buildLocalFinancialBackup()
    backup.workspaces[0].transactions.push({
      id: 't1', description: 'Mercado', amountCents: 9000,
      kind: 'expense', category: 'Mercado', occurredOn: '2026-11-09',
      createdAt: '2026-11-09T12:00:00Z',
    })
    const original = await planLegacyIdentifiers(backup, alice)
    const otherOwner = await planLegacyIdentifiers(backup, bob)
    expect(original.records.map(x => x.sourceKey))
      .not.toEqual(otherOwner.records.map(x => x.sourceKey))
    const change = structuredClone(backup)
    change.workspaces[0].transactions[0].amountCents = 9500
    const changed = await planLegacyIdentifiers(change, alice)
    const key = original.records.find(x => x.type === 'transaction')?.sourceKey
    expect(key).toBe(changed.records.find(x => x.type === 'transaction')?.sourceKey)
    expect(original.contentFingerprint).not.toBe(changed.contentFingerprint)
  })

  it('separa registros com mesmo ID em categorias distintas e marca pagamentos sem data', async () => {
    const backup = buildLocalFinancialBackup()
    backup.workspaces[0].bills.push({
      id: 'registro-1', name: 'Energia', dueDay: 10, active: true, createdAt: '2026-11-09',
    })
    backup.workspaces[0].fixedExpenses.push({
      id: 'registro-1', name: 'Academia', amountCents: 5000, dueDay: 10,
      startMonth: '2026-10', endBeforeMonth: null, paidMonths: ['2026-10'],
      createdAt: '2026-10-01',
    })
    const plan = await planLegacyIdentifiers(backup, alice)
    const bill = plan.records.find(x => x.type === 'bill')
    const fixed = plan.records.find(x => x.type === 'fixed-expense')
    expect(bill?.sourceKey).not.toBe(fixed?.sourceKey)
    expect(plan.requiresPaymentDateReview).toBe(1)
    expect(plan.records.find(x => x.type === 'fixed-payment')?.needsPaymentDateReview).toBe(true)
  })

  it('mantém identificadores independentes da ordem dos arrays', async () => {
    const backup = buildLocalFinancialBackup()
    for (const n of [1, 2]) backup.workspaces[0].transactions.push({
      id: 't-' + n, description: 'Gasto ' + n, amountCents: 100 * n,
      kind: 'expense', category: 'Outros', occurredOn: '2026-11-09', createdAt: '2026-11-09',
    })
    const one = await planLegacyIdentifiers(backup, alice)
    const reorder = structuredClone(backup)
    reorder.workspaces[0].transactions.reverse()
    const two = await planLegacyIdentifiers(reorder, alice)
    expect(one.contentFingerprint).toBe(two.contentFingerprint)
    expect(one.records).toEqual(two.records)
  })

  it('impede preparação de identidades se houver referências órfãs ou IDs repetidos', async () => {
    const backup = buildLocalFinancialBackup()
    backup.workspaces[0].monthlyEntries.push({
      id: 'sem-conta', billId: 'inexistente', yearMonth: '2026-11',
      amountCents: 1000, status: 'pending', paidAt: null,
    })
    await expect(planLegacyIdentifiers(backup, alice)).rejects.toThrow('incompatibilidades')
    expect(saved.size).toBe(0)
  })

  it('rejeita usuário sem UUID confiável', async () => {
    await expect(planLegacyIdentifiers(buildLocalFinancialBackup(), 'nome@exemplo.com'))
      .rejects.toThrow('Titular')
  })
})
