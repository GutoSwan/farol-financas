import { Client, Pool } from 'pg'
import { X509Certificate } from 'node:crypto'
import { previewPgOptions } from './pgVerifiedOptions.js'

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

  // Mesma cadeia de confiança usada pelo Prisma: CA do Supabase e
  // verificação de certificado/hostname obrigatória.
  const options = previewPgOptions(connectionString)
  const client = new Client(options)

  // Diagnóstico da CA em Preview: publica somente indicadores booleanos.
  // A impressão digital de referência é a CA pública Supabase Root 2021.
  const expectedFingerprint = '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa'
  const configuredSsl = options.ssl
  const certificate = configuredSsl && typeof configuredSsl === 'object' && 'ca' in configuredSsl
    ? configuredSsl.ca
    : undefined
  let caMatchesOfficial = false
  if (typeof certificate === 'string') {
    try {
      const fingerprint = new X509Certificate(certificate).fingerprint256
        .replace(/:/g, '').toLowerCase()
      caMatchesOfficial = fingerprint === expectedFingerprint
    } catch { /* O certificado não passou na validação do parser X509. */ }
  }
  // O tipo público Client não expõe connectionParameters; este acesso
  // é opcional e usado somente para o diagnóstico em Preview.
  const diagnosticClient = client as unknown as {
    connectionParameters?: { ssl?: unknown }
  }
  const effectiveSsl = diagnosticClient.connectionParameters?.ssl
  const effectiveCa = effectiveSsl && typeof effectiveSsl === 'object' && 'ca' in effectiveSsl
    ? effectiveSsl.ca
    : undefined
  console.info('[farol-api] pg TLS verificado:',
    'caCorreta=' + caMatchesOfficial,
    'caAplicada=' + (typeof certificate === 'string' && effectiveCa === certificate))

  let connected = false
  let phase = 'conexao'
  try {
    await client.connect()
    connected = true
    phase = 'consulta'
    await client.query('SELECT 1')
    console.info('[farol-api] pg nativo: conexao e SELECT 1 OK')

    // PrismaPg utiliza Pool, portanto testamos esse mesmo caminho separado
    // do Prisma para saber se o problema é no driver/SSL ou no adaptador.
    const pool = new Pool({ ...previewPgOptions(connectionString), max: 2 })
    try {
      await pool.query('SELECT 1')
      console.info('[farol-api] pg pool: SELECT 1 OK')

      // Teste somente leitura do adaptador, isolado do PrismaClient.
      // Dessa forma distinguimos erros em PrismaPg de erros no engine gerado.
      const { PrismaPg } = await import('@prisma/adapter-pg')
      const factory = new PrismaPg({ ...previewPgOptions(connectionString), max: 2 })
      let adapter: Awaited<ReturnType<typeof factory.connect>> | undefined
      try {
        adapter = await factory.connect()
        console.info('[farol-api] adaptador PrismaPg: connect OK')
        await adapter.queryRaw({ sql: 'SELECT 1', args: [], argTypes: [] })
        console.info('[farol-api] adaptador PrismaPg: SELECT 1 OK')
      } catch (adapterError: unknown) {
        const info = getErrorInfo(adapterError)
        const name = adapterError instanceof Error ? adapterError.name : 'Desconhecido'
        console.error('[farol-api] adaptador PrismaPg falhou:',
          'classe=' + (/^[a-zA-Z]{1,64}$/.test(name) ? name : 'Desconhecida'),
          'categoria=' + info.category, 'codigo=' + info.code)
        // Não encobrir a falha do PrismaClient: o teste é observacional.
      } finally {
        if (adapter) {
          try { await adapter.dispose() } catch { /* Sem imprimir dados privados. */ }
        }
      }
    } catch (poolError: unknown) {
      const poolInfo = getErrorInfo(poolError)
      console.error('[farol-api] pg pool falhou:',
        'categoria=' + poolInfo.category, 'codigo=' + poolInfo.code)
      throw new Error('Falha no pool pg')
    } finally {
      await pool.end()
    }
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
