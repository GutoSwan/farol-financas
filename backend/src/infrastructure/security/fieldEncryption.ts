import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Criptografia autenticada de campos para FUTURA persistência financeira.
 * As chaves DEVEM vir de um KMS ou gerenciador de segredos fora do PostgreSQL,
 * nunca da aplicação web nem de constantes no repositório.
 */
export interface EncryptedFieldV1 {
  version: 1
  algorithm: 'AES-256-GCM'
  keyId: string
  iv: string
  tag: string
  ciphertext: string
}

export interface EncryptionContext {
  workspaceId: string
  resourceType: string
  resourceId: string
}

export interface EncryptionKey {
  id: string
  bytes: Uint8Array
}

const MAX_PLAINTEXT_BYTES = 64 * 1024

function contextBytes(context: EncryptionContext): Buffer {
  if (![context.workspaceId, context.resourceType, context.resourceId].every(
    (value) => typeof value === 'string' && value.length >= 1 && value.length <= 150,
  )) throw new Error('Contexto de criptografia inválido.')
  return Buffer.from(JSON.stringify([
    'farol-sensitive-field-v1',
    context.workspaceId,
    context.resourceType,
    context.resourceId,
  ]), 'utf8')
}

function keyBytes(key: EncryptionKey): Buffer {
  if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(key.id) || key.bytes.length !== 32) {
    throw new Error('Chave de criptografia não configurada corretamente.')
  }
  return Buffer.from(key.bytes)
}

/** IV aleatório exclusivo por campo, tag GCM e vínculo criptográfico ao registro. */
export function encryptField(plaintext: string, context: EncryptionContext, key: EncryptionKey): EncryptedFieldV1 {
  const value = Buffer.from(plaintext, 'utf8')
  if (!value.length || value.length > MAX_PLAINTEXT_BYTES) throw new Error('Tamanho do campo inválido.')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyBytes(key), iv)
  cipher.setAAD(contextBytes(context))
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()])
  return {
    version: 1,
    algorithm: 'AES-256-GCM',
    keyId: key.id,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

/** Decifração falha se alguém adulterar o dado ou tentar movê-lo para outro registro. */
export function decryptField(
  envelope: EncryptedFieldV1,
  context: EncryptionContext,
  key: EncryptionKey,
): string {
  try {
    if (envelope.version !== 1 || envelope.algorithm !== 'AES-256-GCM' || envelope.keyId !== key.id) {
      throw new Error('invalid version')
    }
    const iv = Buffer.from(envelope.iv, 'base64')
    const tag = Buffer.from(envelope.tag, 'base64')
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64')
    if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length || ciphertext.length > MAX_PLAINTEXT_BYTES) {
      throw new Error('invalid envelope')
    }
    const decipher = createDecipheriv('aes-256-gcm', keyBytes(key), iv)
    decipher.setAAD(contextBytes(context))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    // Não revelar se a causa foi chave incorreta, alteração do conteúdo ou ID.
    throw new Error('Não foi possível acessar o conteúdo protegido.')
  }
}
