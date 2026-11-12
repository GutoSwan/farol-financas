import type { buildLocalFinancialBackup } from '../../application/use-cases/exportFinancialBackup'

export type FinancialBackup = ReturnType<typeof buildLocalFinancialBackup>

export interface FinancialBackupSummary {
  spaces: number
  bills: number
  monthlyEntries: number
  fixedExpenses: number
  transactions: number
  budgetProjects: number
  budgetItems: number
  budgetQuotes: number
}

export interface EncryptedBackupEnvelope {
  format: 'farol-financas-encrypted-backup'
  version: 1
  ownerUserId: string
  createdAt: string
  encryption: 'AES-256-GCM'
  derivation: 'PBKDF2-SHA256'
  iterations: number
  salt: string
  iv: string
  payload: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WORKSPACE_ID = /^[a-zA-Z0-9-]{1,90}$/
const ITERATIONS = 310_000
const MAX_BACKUP_BYTES = 6 * 1024 * 1024
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function validArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.length <= 20_000 && value.every(record)
}
function validPassword(password: string): void {
  if (password.length < 14 || password.length > 256) {
    throw new Error('Use uma senha exclusiva com pelo menos 14 caracteres.')
  }
}
function validUserId(userId: string): void {
  if (!UUID.test(userId)) throw new Error('Identidade da conta inválida.')
}
function cryptoApi(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('A criptografia segura não está disponível. Use HTTPS ou o app atualizado.')
  }
  return globalThis.crypto
}
/** WebCrypto no TS 5.8 exige BufferSource com ArrayBuffer, nunca SharedArrayBuffer. */
function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(new ArrayBuffer(bytes.byteLength))
  result.set(bytes)
  return result
}
function base64(bytes: Uint8Array): string {
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += 8192) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + 8192)))
  }
  return btoa(parts.join(''))
}
function unbase64(value: string, exactLength?: number): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Backup criptografado inválido.')
  const bytes = ownedBytes(Uint8Array.from(atob(value), (character) => character.charCodeAt(0)))
  if (exactLength !== undefined && bytes.length !== exactLength) {
    throw new Error('Parâmetros de criptografia inválidos.')
  }
  return bytes
}
async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const subtle = cryptoApi().subtle
  const secret = await subtle.importKey('raw', ownedBytes(encoder.encode(password)), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    secret,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}
function associatedData(userId: string): Uint8Array<ArrayBuffer> {
  return ownedBytes(encoder.encode('farol-financas-encrypted-backup|v1|' + userId))
}

/**
 * Validação somente leitura. A recuperação/transferência real ainda não existe.
 * Nunca aplicar um JSON restaurado diretamente ao localStorage ou ao backend.
 */
export function summarizeFinancialBackup(raw: unknown): FinancialBackupSummary {
  if (!record(raw) || raw.format !== 'farol-financas-local-backup' || raw.version !== 1 ||
      typeof raw.exportedAt !== 'string' || !Number.isFinite(Date.parse(raw.exportedAt)) ||
      !Array.isArray(raw.workspaces) || raw.workspaces.length < 1 || raw.workspaces.length > 100 ||
      typeof raw.activeWorkspaceId !== 'string') {
    throw new Error('O arquivo não contém um backup financeiro reconhecido.')
  }
  const seen = new Set<string>()
  const summary: FinancialBackupSummary = {
    spaces: 0, bills: 0, monthlyEntries: 0, fixedExpenses: 0, transactions: 0,
    budgetProjects: 0, budgetItems: 0, budgetQuotes: 0,
  }
  for (const item of raw.workspaces as unknown[]) {
    if (!record(item) || !record(item.workspace) ||
        typeof item.workspace.id !== 'string' || !WORKSPACE_ID.test(item.workspace.id) ||
        typeof item.workspace.name !== 'string' || item.workspace.name.length < 1 ||
        item.workspace.name.length > 60 || seen.has(item.workspace.id) ||
        !validArray(item.bills) || !validArray(item.monthlyEntries) ||
        !validArray(item.fixedExpenses) || !validArray(item.transactions) ||
        !record(item.budgets) || !validArray(item.budgets.projects) ||
        !validArray(item.budgets.items) || !validArray(item.budgets.quotes)) {
      throw new Error('Backup inconsistente. Nenhuma informação foi alterada.')
    }
    seen.add(item.workspace.id)
    summary.spaces++
    summary.bills += item.bills.length
    summary.monthlyEntries += item.monthlyEntries.length
    summary.fixedExpenses += item.fixedExpenses.length
    summary.transactions += item.transactions.length
    summary.budgetProjects += item.budgets.projects.length
    summary.budgetItems += item.budgets.items.length
    summary.budgetQuotes += item.budgets.quotes.length
  }
  if (!seen.has(raw.activeWorkspaceId)) {
    throw new Error('O espaço ativo do backup não está presente.')
  }
  return summary
}

/**
 * Identifica o conteúdo de um snapshot sem depender da hora da exportação.
 * O digest não contém senha, chave e não substitui autenticação ou backup.
 */
export async function fingerprintFinancialBackup(raw: unknown): Promise<string> {
  summarizeFinancialBackup(raw)
  if (!record(raw)) throw new Error('Snapshot financeiro inválido.')
  const { exportedAt: _exportedAt, ...financialContent } = raw
  const bytes = ownedBytes(encoder.encode(JSON.stringify(financialContent)))
  if (bytes.byteLength > MAX_BACKUP_BYTES) {
    throw new Error('Backup maior que 6 MB. Nenhuma informação foi alterada.')
  }
  const digest = await cryptoApi().subtle.digest('SHA-256', bytes)
  return base64(new Uint8Array(digest))
}

export interface InspectedFinancialBackup {
  summary: FinancialBackupSummary
  fingerprint: string
}

export async function encryptFinancialBackup(
  backup: FinancialBackup, password: string, ownerUserId: string,
): Promise<EncryptedBackupEnvelope> {
  validPassword(password)
  validUserId(ownerUserId)
  summarizeFinancialBackup(backup)
  const plaintext = ownedBytes(encoder.encode(JSON.stringify(backup)))
  if (plaintext.byteLength > MAX_BACKUP_BYTES) {
    throw new Error('Backup maior que 6 MB. Não houve alteração nos registros.')
  }
  const provider = cryptoApi()
  const salt = provider.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
  const iv = provider.getRandomValues(new Uint8Array(new ArrayBuffer(12)))
  const key = await deriveKey(password, salt)
  const ciphertext = await provider.subtle.encrypt({
    name: 'AES-GCM', iv, additionalData: associatedData(ownerUserId), tagLength: 128,
  }, key, plaintext)
  return {
    format: 'farol-financas-encrypted-backup',
    version: 1,
    ownerUserId,
    createdAt: new Date().toISOString(),
    encryption: 'AES-256-GCM',
    derivation: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: base64(salt),
    iv: base64(iv),
    payload: base64(new Uint8Array(ciphertext)),
  }
}

/** Descriptografa em memória; não grava no navegador nem no servidor.
 * Uma restauração exige validações adicionais e confirmação explícita. */
export async function decryptVerifiedFinancialBackup(
  raw: unknown, password: string, expectedUserId: string,
): Promise<FinancialBackup> {
  validUserId(expectedUserId)
  if (!record(raw) || raw.format !== 'farol-financas-encrypted-backup' ||
      raw.version !== 1 || raw.ownerUserId !== expectedUserId ||
      raw.encryption !== 'AES-256-GCM' || raw.derivation !== 'PBKDF2-SHA256' ||
      raw.iterations !== ITERATIONS || typeof raw.salt !== 'string' ||
      typeof raw.iv !== 'string' || typeof raw.payload !== 'string' ||
      raw.payload.length > MAX_BACKUP_BYTES * 2) {
    throw new Error('Backup incompatível com esta conta ou formato.')
  }
  const salt = unbase64(raw.salt, 16)
  const iv = unbase64(raw.iv, 12)
  const ciphertext = unbase64(raw.payload)
  if (ciphertext.byteLength < 17 || ciphertext.byteLength > MAX_BACKUP_BYTES + 16) {
    throw new Error('Arquivo criptografado com tamanho inválido.')
  }
  const key = await deriveKey(password, salt)
  let plaintext: ArrayBuffer
  try {
    plaintext = await cryptoApi().subtle.decrypt({
      name: 'AES-GCM', iv, additionalData: associatedData(expectedUserId), tagLength: 128,
    }, key, ciphertext)
  } catch {
    throw new Error('Senha incorreta ou arquivo adulterado. Nenhum dado foi alterado.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(decoder.decode(plaintext)) as unknown
  } catch {
    throw new Error('Conteúdo do backup está danificado.')
  }
  summarizeFinancialBackup(parsed)
  return parsed as FinancialBackup
}

/** Mantém a conferência por fingerprint sem expor o conteúdo descriptografado. */
export async function inspectEncryptedFinancialBackupWithFingerprint(
  raw: unknown, password: string, expectedUserId: string,
): Promise<InspectedFinancialBackup> {
  const snapshot = await decryptVerifiedFinancialBackup(raw, password, expectedUserId)
  return {
    summary: summarizeFinancialBackup(snapshot),
    fingerprint: await fingerprintFinancialBackup(snapshot),
  }
}

/** Mantém o contrato anterior para chamadas que apenas precisam do inventário. */
export async function inspectEncryptedFinancialBackup(
  raw: unknown, password: string, expectedUserId: string,
): Promise<FinancialBackupSummary> {
  return (await inspectEncryptedFinancialBackupWithFingerprint(raw, password, expectedUserId)).summary
}
