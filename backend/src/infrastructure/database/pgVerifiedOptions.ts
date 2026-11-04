import type { PoolConfig } from 'pg'

// Configuração exclusiva do Preview: CA fornecida pelo Supabase, sem desligar
// a validação TLS. Nunca registrar o PEM ou a URL de conexão.
export function previewPgOptions(connectionString: string): PoolConfig {
  const certificate = process.env.SUPABASE_DB_CA_CERT
    ?.replace(/\\n/g, '\n')
    .trim()
  if (!certificate ||
      !certificate.includes('-----BEGIN CERTIFICATE-----') ||
      !certificate.includes('-----END CERTIFICATE-----')) {
    throw new Error('Certificado CA do Supabase ausente ou inválido no Preview')
  }

  const url = new URL(connectionString)
  // node-postgres substitui o objeto SSL se a URL contiver opções SSL.
  // O adaptador PG também não precisa destes parâmetros do Prisma.
  for (const parameter of [
    'sslmode', 'sslrootcert', 'sslcert', 'sslkey',
    'pgbouncer', 'connection_limit',
  ]) {
    url.searchParams.delete(parameter)
  }

  return {
    connectionString: url.toString(),
    ssl: { ca: certificate, rejectUnauthorized: true },
    connectionTimeoutMillis: 7000,
  }
}
