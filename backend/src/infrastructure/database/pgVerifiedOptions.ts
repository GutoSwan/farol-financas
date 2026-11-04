import type { PoolConfig } from 'pg'
import { SUPABASE_ROOT_2021_CA } from './supabaseRoot2021Ca.js'

// Apenas no Preview, utiliza a CA pública oficial versionada no código.
// Evita erros de cópia no campo multilinha da Vercel.
// A validação TLS e de hostname continua obrigatória.
export function previewPgOptions(connectionString: string): PoolConfig {
  const url = new URL(connectionString)
  // node-postgres substitui as opções SSL se parâmetros SSL vierem na URL.
  // Remove apenas opções de driver que poderiam sobrescrever a CA.
  for (const parameter of [
    'sslmode', 'sslrootcert', 'sslcert', 'sslkey',
    'pgbouncer', 'connection_limit',
  ]) {
    url.searchParams.delete(parameter)
  }

  return {
    connectionString: url.toString(),
    ssl: { ca: SUPABASE_ROOT_2021_CA, rejectUnauthorized: true },
    connectionTimeoutMillis: 7000,
  }
}
