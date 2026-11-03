import { Client } from 'pg'

/**
 * Diagnóstico restrito ao Preview: isola rede/credenciais PostgreSQL do Prisma.
 * Nunca registra string de conexão, SQL, texto de erro, stack ou metadados.
 */
export async function diagnosePgConnection(connectionString: string): Promise<void> {
  const url = new URL(connectionString)
  // pg não precisa dos parâmetros específicos do datasource Prisma.
  url.searchParams.delete('pgbouncer')
  url.searchParams.delete('connection_limit')
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require')

  const client = new Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 7000,
  })
  let connected = false
  try {
    await client.connect()
    connected = true
    await client.query('SELECT 1')
    console.info('[farol-api] pg nativo: conexao e SELECT 1 OK')
  } catch (error: unknown) {
    const candidate =
      error !== null && typeof error === 'object' && 'code' in error
        ? error.code
        : undefined
    const safeCode = typeof candidate === 'string' &&
      /^(?:[0-9A-Z]{5}|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)$/.test(candidate)
      ? candidate
      : 'sem codigo'
    console.error('[farol-api] pg nativo falhou; codigo=' + safeCode)
    throw new Error('Falha no teste pg nativo')
  } finally {
    if (connected) {
      try { await client.end() } catch { /* Evitar expor metadados no fechamento. */ }
    }
  }
}
