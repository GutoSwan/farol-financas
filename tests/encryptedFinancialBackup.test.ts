import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { buildLocalFinancialBackup } from '../src/application/use-cases/exportFinancialBackup'
import {
  encryptFinancialBackup, inspectEncryptedFinancialBackup, inspectEncryptedFinancialBackupWithFingerprint,
  fingerprintFinancialBackup, summarizeFinancialBackup,
} from '../src/infrastructure/backup/encryptedFinancialBackup'

const ownerId = '11111111-1111-4111-8111-111111111111'
const anotherId = '22222222-2222-4222-8222-222222222222'
const passphrase = 'senha longa somente para backup 2026'
const data = new Map<string, string>()

beforeEach(() => {
  data.clear()
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  })
})

describe('Backup financeiro local criptografado', () => {
  it('criptografa, confere integridade e mantém o conteúdo fora do arquivo público', async () => {
    data.set('farol-financas:dev:v1', JSON.stringify({
      bills: [{ id: 'internet', name: 'Internet privada', dueDay: 10, active: true, createdAt: '2026-11-09' }],
      entries: [],
    }))
    data.set('sb-credentials', 'token-secreto-nao-exportar')
    const before = new Map(data)
    const raw = buildLocalFinancialBackup()
    const encrypted = await encryptFinancialBackup(raw, passphrase, ownerId)
    expect(encrypted.format).toBe('farol-financas-encrypted-backup')
    expect(JSON.stringify(encrypted)).not.toContain('Internet privada')
    expect(JSON.stringify(encrypted)).not.toContain('token-secreto-nao-exportar')
    await expect(inspectEncryptedFinancialBackup(encrypted, passphrase, ownerId))
      .resolves.toMatchObject({ spaces: 1, bills: 1, monthlyEntries: 0 })
    expect(data).toEqual(before)
  })

  it('associa a conferência ao conteúdo real e detecta alterações com o mesmo número de registros', async () => {
    const backup = buildLocalFinancialBackup()
    backup.workspaces[0].transactions.push({
      id: 'transacao-1', description: 'Mercado', amountCents: 9000,
      category: 'Alimentação', kind: 'expense', occurredOn: '2026-11-09',
      createdAt: '2026-11-09T11:00:00Z',
    })
    const encrypted = await encryptFinancialBackup(backup, passphrase, ownerId)
    const verified = await inspectEncryptedFinancialBackupWithFingerprint(encrypted, passphrase, ownerId)
    expect(verified.summary.transactions).toBe(1)
    expect(verified.fingerprint).toBe(await fingerprintFinancialBackup(backup))

    // Uma mudança de valor NÃO pode passar só porque o inventário tem 1 lançamento.
    const changed = structuredClone(backup)
    changed.workspaces[0].transactions[0].amountCents = 9100
    expect((await fingerprintFinancialBackup(changed))).not.toBe(verified.fingerprint)
    expect((await fingerprintFinancialBackup(changed))).not.toBe(await fingerprintFinancialBackup(backup))
  })

  it('ignora apenas a data de exportação, não o conteúdo financeiro ou o espaço ativo', async () => {
    const backup = buildLocalFinancialBackup()
    const changedTime = { ...backup, exportedAt: '2020-01-01T00:00:00.000Z' }
    expect(await fingerprintFinancialBackup(changedTime)).toBe(await fingerprintFinancialBackup(backup))

    const changedContent = structuredClone(backup)
    changedContent.workspaces[0].workspace.name = 'Outro nome'
    expect(await fingerprintFinancialBackup(changedContent)).not.toBe(await fingerprintFinancialBackup(backup))
    expect(data.size).toBe(0)
  })

  it('mantém o contrato público anterior de conferência somente por inventário', async () => {
    const backup = buildLocalFinancialBackup()
    const encrypted = await encryptFinancialBackup(backup, passphrase, ownerId)
    expect(await inspectEncryptedFinancialBackup(encrypted, passphrase, ownerId)).toMatchObject({
      spaces: 1, transactions: 0,
    })
    expect(data.size).toBe(0)
  })

  it('não abre arquivo de outra conta nem com a senha certa', async () => {
    const encrypted = await encryptFinancialBackup(buildLocalFinancialBackup(), passphrase, ownerId)
    await expect(inspectEncryptedFinancialBackup(encrypted, passphrase, anotherId))
      .rejects.toThrow('Backup incompatível')
    expect(data.size).toBe(0)
  })

  it('rejeita senha incorreta e payload adulterado sem sobrescrever dados locais', async () => {
    const encrypted = await encryptFinancialBackup(buildLocalFinancialBackup(), passphrase, ownerId)
    await expect(inspectEncryptedFinancialBackup(encrypted, 'senha totalmente errada', ownerId))
      .rejects.toThrow('Senha incorreta ou arquivo adulterado')
    const changed = { ...encrypted, payload: encrypted.payload.slice(0, 3) +
      (encrypted.payload[3] === 'A' ? 'B' : 'A') + encrypted.payload.slice(4) }
    await expect(inspectEncryptedFinancialBackup(changed, passphrase, ownerId))
      .rejects.toThrow()
    expect(data.size).toBe(0)
  })

  it('impede uso de senha fraca e snapshot sem estrutura esperada', async () => {
    await expect(encryptFinancialBackup(buildLocalFinancialBackup(), 'curta', ownerId))
      .rejects.toThrow('14 caracteres')
    expect(() => summarizeFinancialBackup({
      format: 'farol-financas-local-backup', version: 1, exportedAt: new Date().toISOString(),
      activeWorkspaceId: 'household-default', workspaces: [{ workspace: { id: 'household-default', name: 'Casa' },
        bills: 'não é lista', monthlyEntries: [], fixedExpenses: [], transactions: [],
        budgets: { projects: [], items: [], quotes: [] } }],
    })).toThrow('Backup inconsistente')
  })

  it('rejeita espaços duplicados e chaves de outra identidade dentro do snapshot', () => {
    const raw = buildLocalFinancialBackup()
    expect(() => summarizeFinancialBackup({
      ...raw, activeWorkspaceId: 'outro-espaco',
    })).toThrow('espaço ativo')
    expect(() => summarizeFinancialBackup({
      ...raw, workspaces: [...raw.workspaces, raw.workspaces[0]],
    })).toThrow('Backup inconsistente')
  })

  it('gera nonce e salt aleatórios em arquivos independentes', async () => {
    const raw = buildLocalFinancialBackup()
    const first = await encryptFinancialBackup(raw, passphrase, ownerId)
    const second = await encryptFinancialBackup(raw, passphrase, ownerId)
    expect(first.iv).not.toBe(second.iv)
    expect(first.salt).not.toBe(second.salt)
    expect(first.payload).not.toBe(second.payload)
  })
})
