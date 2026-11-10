import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { totpCode, onlyOwnRows, validateQaEnvironment } from './qa-real-auth-guards.mjs'

function clientFor(url, key) {
  return createClient(url, key, {
    auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
    },
    global: { headers: { 'X-Client-Info': 'farol-qa-e2e' } },
  })
}
function assertOk(error, step) {
  if (error) throw new Error('Falha em ' + step + '. Confira a execução sem expor credenciais.')
}
function requireState(condition, step) {
  if (!condition) throw new Error('Falha na validação: ' + step)
}

async function loginWithMfa(client, account, alias) {
  console.info(alias + ': verificando login com senha.')
  const login = await client.auth.signInWithPassword({
    email: account.email, password: account.password,
  })
  assertOk(login.error, alias + ': login')
  requireState(login.data.user?.id && login.data.user?.email?.toLowerCase() === account.email.toLowerCase(),
    alias + ': identidade diferente da conta QA')
  const identity = login.data.user.id
  requireState(!!login.data.user.email_confirmed_at, alias + ': e-mail não confirmado')
  const before = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  assertOk(before.error, alias + ': nível antes do 2FA')
  requireState(before.data.currentLevel === 'aal1', alias + ': senha não iniciou em AAL1')

  const factors = await client.auth.mfa.listFactors()
  assertOk(factors.error, alias + ': fatores')
  const verified = factors.data.totp.filter(factor => factor.status === 'verified')
  requireState(verified.length === 1, alias + ': exige exatamente um autenticador verificado')
  console.info(alias + ': confirmando segundo fator.')
  const verifiedResult = await client.auth.mfa.challengeAndVerify({
    factorId: verified[0].id,
    code: totpCode(account.totp),
  })
  assertOk(verifiedResult.error, alias + ': confirmação 2FA')
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  assertOk(assurance.error, alias + ': nível depois do 2FA')
  requireState(assurance.data.currentLevel === 'aal2', alias + ': AAL2 não alcançado')

  const user = await client.auth.getUser()
  assertOk(user.error, alias + ': identidade autenticada')
  requireState(user.data.user?.id === identity, alias + ': sessão mudou depois do 2FA')
  console.info(alias + ': login e 2FA aprovados.')
  return identity
}

async function checkOnlyOwn(client, identity, alias) {
  const result = await client.from('calendar_events').select('id,user_id').limit(100)
  assertOk(result.error, alias + ': consulta do calendário')
  requireState(onlyOwnRows(result.data, identity), alias + ': consulta retornou dados de outra conta')
  console.info(alias + ': não recebeu compromissos de outra conta na consulta.')
}

async function createFixture(client, userId, alias) {
  const id = randomUUID()
  const startsAt = new Date(Date.now() + 6 * 3600_000).toISOString()
  const endsAt = new Date(Date.now() + 7 * 3600_000).toISOString()
  const entry = {
    id, user_id: userId,
    title: 'FAROL-QA-TEST-' + id.slice(0, 8),
    description: 'Teste automático temporário do Farol. Não é um evento real.',
    starts_at: startsAt, ends_at: endsAt, all_day: false, reminder_minutes: null,
  }
  const response = await client.from('calendar_events').insert(entry).select('id,user_id')
  assertOk(response.error, alias + ': criar compromisso fictício')
  requireState(response.data?.length === 1 &&
      response.data[0].id === id && response.data[0].user_id === userId,
    alias + ': compromisso fictício não foi criado corretamente')
  console.info(alias + ': compromisso fictício criado.')
  return id
}

async function readOne(client, id, userId) {
  const result = await client.from('calendar_events').select('id,user_id').eq('id', id)
  assertOk(result.error, 'consulta cruzada')
  requireState(Array.isArray(result.data) && onlyOwnRows(result.data, userId),
    'conta recebeu registro pertencente a outro titular')
  return result.data
}

async function removeFixture(client, id, userId, alias) {
  if (!id) return
  const response = await client.from('calendar_events')
    .delete().eq('id', id).eq('user_id', userId).select('id')
  assertOk(response.error, alias + ': limpeza')
  requireState(response.data?.length === 1 && response.data[0].id === id,
    alias + ': registro fictício não foi removido; verificar manualmente no Dev.')
  console.info(alias + ': compromisso fictício removido.')
}

async function testIsolation(a, b, aId, bId) {
  console.info('Verificando separação dos dados entre as duas contas QA.')
  const ownA = await readOne(a.client, aId, a.userId)
  const ownB = await readOne(b.client, bId, b.userId)
  requireState(ownA.length === 1 && ownB.length === 1,
    'conta não conseguiu ler o próprio compromisso')
  const crossB = await readOne(b.client, aId, b.userId)
  const crossA = await readOne(a.client, bId, a.userId)
  requireState(crossB.length === 0 && crossA.length === 0,
    'uma conta conseguiu visualizar o compromisso da outra')

  const unauthorized = await b.client.from('calendar_events')
    .update({ title: 'FAROL-QA-UNAUTHORIZED' }).eq('id', aId).select('id')
  if (unauthorized.error) {
    requireState(unauthorized.error.code === '42501' || unauthorized.status === 403,
      'erro inesperado ao testar bloqueio de edição')
  } else {
    requireState(unauthorized.data?.length === 0,
      'conta B alterou compromisso da conta A')
  }
  console.info('Isolamento cruzado aprovado: nenhuma conta leu ou editou o evento da outra.')
}

/**
 * NÃO roda no CI comum. Requer disparo manual explícito, duas contas
 * exclusivamente QA + TOTP já configurado e segredo de ambiente protegido.
 */
export async function run() {
  const config = validateQaEnvironment(process.env)
  const a = { client: clientFor(config.url, config.key), userId: null, fixture: null }
  const b = { client: clientFor(config.url, config.key), userId: null, fixture: null }
  let problem = null
  try {
    a.userId = await loginWithMfa(a.client, config.a, 'Conta QA A')
    b.userId = await loginWithMfa(b.client, config.b, 'Conta QA B')
    requireState(a.userId !== b.userId, 'as duas contas pertencem à mesma identidade')
    await checkOnlyOwn(a.client, a.userId, 'Conta QA A')
    await checkOnlyOwn(b.client, b.userId, 'Conta QA B')
    if (config.withFixtures) {
      a.fixture = await createFixture(a.client, a.userId, 'Conta QA A')
      b.fixture = await createFixture(b.client, b.userId, 'Conta QA B')
      await testIsolation(a, b, a.fixture, b.fixture)
    } else {
      console.info('Modo somente leitura: a separação entre duas contas NÃO foi comprovada com registros fictícios.')
    }
    console.info('Verificações reais de autenticação finalizadas.')
  } catch {
    // Não imprimir payloads, endereços de e-mail, chaves, token ou detalhes do Auth.
    problem = new Error('Teste real do Supabase Dev não passou; conferir os passos resumidos e ambiente protegido.')
  } finally {
    const cleanFailures = []
    for (const [account, label] of [[a, 'QA A'], [b, 'QA B']]) {
      if (account.fixture && account.userId) {
        try { await removeFixture(account.client, account.fixture, account.userId, label) }
        catch { cleanFailures.push(label) }
      }
      try { await account.client.auth.signOut() } catch { /* sessão efêmera */ }
    }
    if (cleanFailures.length) {
      problem = new Error('FALHA DE LIMPEZA: conferir eventos artificiais das contas ' + cleanFailures.join(', ') + '.')
    }
  }
  if (problem) throw problem
}

if (process.argv[1]?.endsWith('qa-real-auth-e2e.mjs')) {
  run().catch(error => {
    console.error(error instanceof Error ? error.message : 'QA real falhou.')
    process.exitCode = 1
  })
}
