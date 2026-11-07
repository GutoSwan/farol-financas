import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const VERSION = 'v1'
const MAX_PDF_SIZE = 10 * 1024 * 1024
export type EncryptedEnvelope = {
  version: 'v1'
  iv: string
  ciphertext: string
  tag: string
}
function keyFromEnvironment(keyBase64: string | undefined): Buffer {
  if (!keyBase64 || !/^[A-Za-z0-9+/]{43}=$/.test(keyBase64)) {
    throw new Error('Chave de criptografia ausente ou inválida.')
  }
  const key = Buffer.from(keyBase64, 'base64')
  if (key.length !== 32 || key.toString('base64') !== keyBase64) {
    throw new Error('Chave de criptografia inválida.')
  }
  return key
}
function associatedData(workspaceId: string, invoiceId: string, purpose: 'metadata'|'pdf'): Buffer {
  if (!/^[a-f0-9-]{36}$/i.test(workspaceId) || !/^[a-f0-9-]{36}$/i.test(invoiceId)) {
    throw new Error('Identificador de fatura inválido.')
  }
  return Buffer.from(`farol-invoice|${VERSION}|${purpose}|${workspaceId}|${invoiceId}`, 'utf8')
}

export function encryptInvoiceBytes(
  plaintext: Buffer, keyBase64: string | undefined,
  workspaceId: string, invoiceId: string, purpose: 'metadata'|'pdf',
): EncryptedEnvelope {
  if (!Buffer.isBuffer(plaintext) || plaintext.length < 1 || plaintext.length > MAX_PDF_SIZE) {
    throw new Error('Tamanho de dados inválido.')
  }
  const key = keyFromEnvironment(keyBase64)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(associatedData(workspaceId, invoiceId, purpose))
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    version: VERSION, iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'), tag: tag.toString('base64'),
  }
}

export function decryptInvoiceBytes(
  envelope: EncryptedEnvelope, keyBase64: string | undefined,
  workspaceId: string, invoiceId: string, purpose: 'metadata'|'pdf',
): Buffer {
  if (envelope.version !== VERSION) throw new Error('Versão de criptografia desconhecida.')
  const decode = (value: string, size?: number): Buffer => {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Envelope criptográfico inválido.')
    const data = Buffer.from(value, 'base64')
    if (data.toString('base64') !== value || (size !== undefined && data.length !== size)) {
      throw new Error('Envelope criptográfico inválido.')
    }
    return data
  }
  const iv = decode(envelope.iv, 12), tag = decode(envelope.tag, 16)
  const ciphertext = decode(envelope.ciphertext)
  if (!ciphertext.length || ciphertext.length > MAX_PDF_SIZE) throw new Error('Envelope muito grande.')
  const decipher = createDecipheriv('aes-256-gcm', keyFromEnvironment(keyBase64), iv)
  decipher.setAAD(associatedData(workspaceId, invoiceId, purpose))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

/** Não armazena PDF original: retorna bytes cifrados e hash do arquivo cifrado. */
export function prepareEncryptedInvoicePdf(
  pdf: Buffer, keyBase64: string | undefined, workspaceId: string, invoiceId: string,
): { bytes: Buffer; sha256: string; contentType: 'application/octet-stream' } {
  if (!Buffer.isBuffer(pdf) || pdf.length < 8 || pdf.length > MAX_PDF_SIZE ||
      pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('Somente PDFs válidos com até 10 MB podem ser recebidos.')
  }
  // O cabeçalho não comprova que o PDF é seguro; malware scanning é obrigatório
  // antes de qualquer apresentação/renderização no navegador.
  const envelope = encryptInvoiceBytes(pdf, keyBase64, workspaceId, invoiceId, 'pdf')
  const bytes = Buffer.from(JSON.stringify(envelope), 'utf8')
  return {
    bytes, sha256: createHash('sha256').update(bytes).digest('hex'),
    contentType: 'application/octet-stream',
  }
}
