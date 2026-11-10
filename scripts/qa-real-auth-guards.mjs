import { createHmac } from 'node:crypto'

const DEV_URL = 'https://tvirkrjkgdtybtcundon.supabase.co'
const QA_ALIAS = /^[^@\s+]+\+farolqa(?:-[a-z0-9-]+)?@[^@\s]+\.[^@\s]+$/i
const BASE32 = /^[A-Z2-7]{16,128}={0,6}$/

function read(env, key) {
  const value = env[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error('Configuração QA incompleta: ' + key)
  return value.trim()
}

/**
 * Permissões explícitas impedem execução acidental na produção.
 * Não retornar config ou segredos para logs, URLs ou arquivos.
 */
export function validateQaEnvironment(env) {
  if (read(env, 'FAROL_QA_E2E_ENABLED') !== 'true') {
    throw new Error('Teste QA real não foi autorizado.')
  }
  const url = read(env, 'FAROL_QA_SUPABASE_URL')
  if (url !== DEV_URL) throw new Error('Projeto Supabase não corresponde ao Dev autorizado.')
  const key = read(env, 'FAROL_QA_PUBLISHABLE_KEY')
  if (!/^sb_publishable_[A-Za-z0-9_-]{15,}$/.test(key)) {
    throw new Error('Use uma chave publicável de desenvolvimento, nunca service_role.')
  }
  const aEmail = read(env, 'FAROL_QA_A_EMAIL')
  const bEmail = read(env, 'FAROL_QA_B_EMAIL')
  if (!QA_ALIAS.test(aEmail) || !QA_ALIAS.test(bEmail) ||
      aEmail.toLowerCase() === bEmail.toLowerCase()) {
    throw new Error('É necessário usar dois endereços exclusivos com marcador +farolqa.')
  }
  const aPassword = read(env, 'FAROL_QA_A_PASSWORD')
  const bPassword = read(env, 'FAROL_QA_B_PASSWORD')
  if (aPassword.length < 14 || bPassword.length < 14 || aPassword === bPassword) {
    throw new Error('As duas contas de QA precisam de senhas fortes e diferentes.')
  }
  const aTotp = read(env, 'FAROL_QA_A_TOTP_SECRET').toUpperCase().replace(/\s/g, '')
  const bTotp = read(env, 'FAROL_QA_B_TOTP_SECRET').toUpperCase().replace(/\s/g, '')
  if (!BASE32.test(aTotp) || !BASE32.test(bTotp) || aTotp === bTotp) {
    throw new Error('Cada conta QA deve ter TOTP próprio e já verificado.')
  }
  const withFixtures = env.FAROL_QA_E2E_WRITE_FIXTURES === 'true'
  if (withFixtures && env.FAROL_QA_CONFIRM_FIXTURE_WRITES !== 'true') {
    throw new Error('A criação de compromissos fictícios não foi confirmada.')
  }
  return {
    url, key, withFixtures,
    a: { email: aEmail, password: aPassword, totp: aTotp },
    b: { email: bEmail, password: bPassword, totp: bTotp },
  }
}

function decodeBase32(secret) {
  const trimmed = secret.replace(/=+$/g, '')
  let bits = 0, value = 0
  const output = []
  for (const char of trimmed) {
    const index = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char)
    if (index === -1) throw new Error('Formato de TOTP inválido.')
    value = value * 32 + index
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
      value = value % (2 ** bits)
    }
  }
  return Buffer.from(output)
}

/** RFC 6238: código para uma conta QA; nunca imprimir o valor nem a chave. */
export function totpCode(secret, epochMs = Date.now()) {
  if (!BASE32.test(secret) || !Number.isFinite(epochMs) || epochMs < 0) {
    throw new Error('Configuração TOTP inválida.')
  }
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(epochMs / 30_000)))
  const mac = createHmac('sha1', decodeBase32(secret)).update(counter).digest()
  const offset = mac[mac.length - 1] & 15
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return code.toString().padStart(6, '0')
}

/** Valida que uma resposta não retornou linhas pertencentes à outra conta. */
export function onlyOwnRows(rows, userId) {
  if (!Array.isArray(rows)) throw new Error('Resposta de dados inesperada.')
  return rows.every(row => row && typeof row === 'object' && row.user_id === userId)
}
