import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { decryptInvoiceBytes, encryptInvoiceBytes, prepareEncryptedInvoicePdf } from '../src/infrastructure/security/invoiceEncryption.js'
const KEY = randomBytes(32).toString('base64')
const OTHER_KEY = randomBytes(32).toString('base64')
const SPACE_A = '33333333-3333-4333-8333-333333333333'
const SPACE_B = '44444444-4444-4444-8444-444444444444'
const INVOICE_A = '55555555-5555-4555-8555-555555555555'
const INVOICE_B = '66666666-6666-4666-8666-666666666666'
describe('Segurança criptográfica de faturas', () => {
 it('cifra e decifra metadados com AES-256-GCM', () => {
  const data = Buffer.from(JSON.stringify({issuer:'Banco Exemplo',cardLast4:'1234',totalCents:25830}))
  const ciphertext = encryptInvoiceBytes(data,KEY,SPACE_A,INVOICE_A,'metadata')
  expect(JSON.stringify(ciphertext)).not.toContain('Banco Exemplo')
  expect(decryptInvoiceBytes(ciphertext,KEY,SPACE_A,INVOICE_A,'metadata')).toEqual(data)
 })
 it('usa IV aleatório em cada operação', () => {
  const input = Buffer.from('texto sensível')
  const a = encryptInvoiceBytes(input,KEY,SPACE_A,INVOICE_A,'metadata')
  const b = encryptInvoiceBytes(input,KEY,SPACE_A,INVOICE_A,'metadata')
  expect(a.iv).not.toEqual(b.iv)
  expect(a.ciphertext).not.toEqual(b.ciphertext)
 })
 it('recusa chave ausente, chave curta e chave diferente', () => {
  const plain = Buffer.from('dados')
  expect(() => encryptInvoiceBytes(plain,undefined,SPACE_A,INVOICE_A,'metadata')).toThrow()
  expect(() => encryptInvoiceBytes(plain,randomBytes(16).toString('base64'),SPACE_A,INVOICE_A,'metadata')).toThrow()
  const e = encryptInvoiceBytes(plain,KEY,SPACE_A,INVOICE_A,'metadata')
  expect(() => decryptInvoiceBytes(e,OTHER_KEY,SPACE_A,INVOICE_A,'metadata')).toThrow()
 })
 it('recusa reutilização de envelope em outro espaço, fatura ou finalidade', () => {
  const e = encryptInvoiceBytes(Buffer.from('privado'),KEY,SPACE_A,INVOICE_A,'metadata')
  expect(() => decryptInvoiceBytes(e,KEY,SPACE_B,INVOICE_A,'metadata')).toThrow()
  expect(() => decryptInvoiceBytes(e,KEY,SPACE_A,INVOICE_B,'metadata')).toThrow()
  expect(() => decryptInvoiceBytes(e,KEY,SPACE_A,INVOICE_A,'pdf')).toThrow()
 })
 it('detecta adulteração do conteúdo e da tag', () => {
  const e = encryptInvoiceBytes(Buffer.from('documento confidencial'),KEY,SPACE_A,INVOICE_A,'metadata')
  const corrupt = Buffer.from(e.ciphertext,'base64')
  corrupt[0] ^= 1
  expect(() => decryptInvoiceBytes({...e,ciphertext:corrupt.toString('base64')},KEY,SPACE_A,INVOICE_A,'metadata')).toThrow()
  expect(() => decryptInvoiceBytes({...e,tag:randomBytes(16).toString('base64')},KEY,SPACE_A,INVOICE_A,'metadata')).toThrow()
 })
 it('recusa arquivo não PDF e PDF acima do limite', () => {
  expect(() => prepareEncryptedInvoicePdf(Buffer.from('arquivo qualquer'),KEY,SPACE_A,INVOICE_A)).toThrow()
  const huge = Buffer.concat([Buffer.from('%PDF-1.7'),Buffer.alloc(10*1024*1024)])
  expect(() => prepareEncryptedInvoicePdf(huge,KEY,SPACE_A,INVOICE_A)).toThrow()
 })
 it('arquivo preparado não contém texto do PDF e usa tipo binário', () => {
  const pdf = Buffer.from('%PDF-1.7\nconteudo privado de teste\n%%EOF')
  const prepared = prepareEncryptedInvoicePdf(pdf,KEY,SPACE_A,INVOICE_A)
  expect(prepared.bytes.toString()).not.toContain('conteudo privado')
  expect(prepared.sha256).toMatch(/^[0-9a-f]{64}$/)
  expect(prepared.contentType).toBe('application/octet-stream')
  const decoded = JSON.parse(prepared.bytes.toString())
  expect(decryptInvoiceBytes(decoded,KEY,SPACE_A,INVOICE_A,'pdf')).toEqual(pdf)
 })
})
