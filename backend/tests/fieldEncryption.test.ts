import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptField, encryptField } from '../src/infrastructure/security/fieldEncryption.js'

const key = { id: 'key-v1', bytes: randomBytes(32) }
const context = {
  workspaceId: 'workspace-a',
  resourceType: 'credit-statement',
  resourceId: 'statement-01',
}

describe('Criptografia de campos financeiros (sem persistência)', () => {
  it('criptografa e recupera o texto com AES-256-GCM', () => {
    const value = 'Compra em loja exemplo: R$ 120,00'
    const ciphertext = encryptField(value, context, key)
    expect(ciphertext.algorithm).toBe('AES-256-GCM')
    expect(ciphertext.ciphertext).not.toContain('Compra')
    expect(decryptField(ciphertext, context, key)).toBe(value)
  })

  it('usa IV aleatório diferente para cada criptografia', () => {
    const a = encryptField('Minha fatura', context, key)
    const b = encryptField('Minha fatura', context, key)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it('nega leitura com chave, espaço ou registro diferentes', () => {
    const encrypted = encryptField('Dado confidencial', context, key)
    expect(() => decryptField(encrypted, context, { id: 'key-v1', bytes: randomBytes(32) })).toThrow()
    expect(() => decryptField(encrypted, { ...context, workspaceId: 'workspace-b' }, key)).toThrow()
    expect(() => decryptField(encrypted, { ...context, resourceId: 'outro' }, key)).toThrow()
  })

  it('detecta conteúdo adulterado', () => {
    const encrypted = encryptField('Dado confidencial', context, key)
    const wrong = {
      ...encrypted, tag: Buffer.alloc(16).toString('base64'),
    }
    expect(() => decryptField(wrong, context, key)).toThrow('conteúdo protegido')
  })

  it('rejeita chave de tamanho incorreto', () => {
    expect(() => encryptField('Teste', context, { id: 'key', bytes: randomBytes(16) })).toThrow()
  })
})
