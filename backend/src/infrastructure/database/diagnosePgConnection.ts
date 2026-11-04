import { Client } from 'pg'

/**
 * Diagnóstico somente no ambiente Preview. Não registra dados de conexão,
 * senha, mensagens brutas, SQL, stack ou identificadores do projeto.
 */
function getErrorInfo(error: unknown): { code: string; category: string } {
  const layers: Record<string, unknown>[] = []
  let current: unknown = error
  for (let index = 0; index < 3; index++) {
    if (current === null || typeof current !== 'object') break
    const record = current as Record<string, unknown>
    layers.push(record)
    current = record.cause
  }
  const rawCode = layers.map(e => e.code).find(value => typeof value === 'string')
  const code = typeof rawCode === 'string' &&
    /^(?:[0-9A-Z]{5}|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|ERR_TLS_CERT_ALTNAME_INVALID|CERT_HAS_EXPIRED)$/.test(rawCode)
      ? rawCode : 'sem-codigo'
  const descriptions = layers
    .map(e => typeof e.message === 'string' ? e.message : '')
    .join(' ').toLowerCase()
  let category = 'outra-falha'
  if (/password authentication|invalid password|authentication failed|sasl|scram|password must be a string/.test(descriptions)) category = 'autenticacao'
  else if (/tenant or user not found|user not found|project.*not found/.test(descriptions)) category = 'usuario-pooler'
  else if (/self.signed|certificate|unable to verify|tls|ssl handshake|hostname.*match/.test(descriptions)) category = 'ssl-certificado'
  else if (/enotfound|getaddrinfo|eai_again|name resolution/.test(descriptions)) category = 'dns'
  else if (/timeout|timed out|etimedout/.test(descriptions)) category = 'timeout'
  else if (/econnrefused|connection refused|ehostunreach|network unreachable/.test(descriptions)) category = 'rede'
  else if (/too many connections|remaining connection slots/.test(descriptions)) category = 'limite-conexoes'
  else if (/database.*does not exist/.test(descriptions)) category = 'banco-inexistente'
  return { code, category }
}

export async function diagnosePgConnection(connectionString: string): Promise<void> {
  const url = new URL(connectionString)
  const hostType = url.hostname.endsWith('.pooler.supabase.com')
    ? 'supabase-pooler'
    : url.hostname.startsWith('db.') && url.hostname.endsWith('.supabase.co')
      ? 'supabase-direto'
      : 'outro'
  // Apenas características estruturais. Nunca imprimir host, usuário ou senha.
  console.info('[farol-api] pg configuracao:', 'hostType=' + hostType,
    'port6543=' + (url.port === '6543'),
    'usuarioPooler=' + url.username.startsWith('postgres.'),
    'databasePostgres=' + (url.pathname === '/postgres'),
    'senhaPresente=' + Boolean(url.password))

  // O driver pg não usa os parâmetros do Prisma.
  url.searchParams.delete('pgbouncer')
  url.searchParams.delete('connection_limit')
  // Em pg 8, verify-full mantém a verificação TLS e evita o aviso do sslmode=require.
  url.searchParams.set('sslmode', 'verify-full')

  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 7000 })
  let connected = false
  let phase = 'conexao'
  try {
    await client.connect()
    connected = true
    phase = 'consulta'
    await client.query('SELECT 1')
    console.info('[farol-api] pg nativo: conexao e SELECT 1 OK')
  } catch (error: unknown) {
    const info = getErrorInfo(error)
    console.error('[farol-api] pg diagnostico:',
      'fase=' + phase, 'categoria=' + info.category, 'codigo=' + info.code)
    throw new Error('Falha no teste pg nativo')
  } finally {
    if (connected) {
      try { await client.end() } catch { /* Evitar expor erros de fechamento. */ }
    }
  }
}
