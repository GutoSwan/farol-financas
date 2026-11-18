import 'dotenv/config'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { LIVE_QA_API_ORIGIN, LIVE_QA_AUTH_ORIGIN, requireLiveDevAuthE2eConfig } from '../src/infrastructure/security/liveDevAuthE2eGuard.js'

/**
 * Integração real apenas de LEITURA: Supabase Auth Dev + API Preview Dev.
 * Usa duas contas QA descartáveis, TOTP via terminal e nunca expõe tokens.
 * NÃO cria contas, não altera finanças, não habilita nem executa importação.
 * Execute SOMENTE do próprio Mac com variáveis de ambiente privadas.
 */

class QaStepError extends Error {}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new QaStepError(message)
}

async function main() {
  const cfg = requireLiveDevAuthE2eConfig(process.env)
  const prompt = createInterface({ input: stdin, output: stdout })
  const makeClient = () => createClient(LIVE_QA_AUTH_ORIGIN, cfg.apiKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  const owner = makeClient()
  const viewer = makeClient()

  async function login(client: typeof owner, account: { email: string; password: string }, label: string) {
    const response = await client.auth.signInWithPassword(account)
    assert(!response.error && response.data.session, `Login ${label} recusado pelo Supabase Dev.`)
    const factors = await client.auth.mfa.getAuthenticatorAssuranceLevel()
    assert(!factors.error && factors.data, `Não foi possível verificar o MFA ${label}.`)
    if (factors.data.currentLevel !== 'aal2') {
      const available = await client.auth.mfa.listFactors()
      const factor = available.data?.totp.find(f => f.status === 'verified')
      assert(!available.error && factor, `Conta QA ${label} precisa de autenticador TOTP confirmado.`)
      const challenge = await client.auth.mfa.challenge({ factorId: factor.id })
      assert(!challenge.error && challenge.data?.id, `Desafio MFA ${label} indisponível.`)
      const code = (await prompt.question(`Código TOTP da conta QA ${label}: `)).trim()
      assert(/^\d{6}$/.test(code), `Código TOTP ${label} inválido.`)
      const verified = await client.auth.mfa.verify({
        factorId: factor.id, challengeId: challenge.data.id, code,
      })
      assert(!verified.error, `Código TOTP ${label} não confirmado.`)
    }
    const after = await client.auth.mfa.getAuthenticatorAssuranceLevel()
    assert(!after.error && after.data?.currentLevel === 'aal2', `Conta QA ${label} não chegou ao AAL2.`)
    const session = await client.auth.getSession()
    assert(!session.error && session.data.session?.access_token, `Sessão QA ${label} ausente.`)
    return session.data.session.access_token
  }

  async function api(token: string, path: string, method: 'GET' | 'POST' = 'GET') {
    const response = await fetch(LIVE_QA_API_ORIGIN + '/api/v1' + path, {
      method, redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: '{}' } : {}),
      signal: AbortSignal.timeout(10000),
    })
    return response
  }

  async function apiJson(token: string, path: string, stage: string) {
    const response = await api(token, path)
    assert(response.status === 200, `${stage}: esperado 200, recebido ${response.status}.`)
    // Nunca imprimir dados financeiros, identidades ou JSON recebido.
    return response.json() as Promise<{ data?: unknown }>
  }

  try {
    const health = await fetch(LIVE_QA_API_ORIGIN + '/api/v1/health', {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    })
    assert(health.status === 200, 'Preview da API indisponível ou incorreta.')

    const ownerToken = await login(owner, cfg.owner, 'Owner')
    const viewerToken = await login(viewer, cfg.viewer, 'Viewer')
    const [ownMe, viewMe] = await Promise.all([
      apiJson(ownerToken, '/me', 'Identidade Owner'),
      apiJson(viewerToken, '/me', 'Identidade Viewer'),
    ])
    const ownId = (ownMe.data as { id?: string })?.id
    const viewId = (viewMe.data as { id?: string })?.id
    assert(ownId && viewId && ownId !== viewId, 'Contas QA não são duas identidades distintas.')

    const [ownSpaces, viewSpaces] = await Promise.all([
      apiJson(ownerToken, '/workspaces', 'Espaços Owner'),
      apiJson(viewerToken, '/workspaces', 'Espaços Viewer'),
    ])
    type Space = { id: string; name: string; role: string }
    const a = ownSpaces.data as Space[]
    const b = viewSpaces.data as Space[]
    assert(Array.isArray(a) && Array.isArray(b), 'Listagem de espaços QA inválida.')
    const sharedOwner = a.find(s => s.id === cfg.sharedWorkspaceId)
    const sharedViewer = b.find(s => s.id === cfg.sharedWorkspaceId)
    const privateOwner = a.find(s => s.id === cfg.privateWorkspaceId)
    assert(sharedOwner?.role === 'OWNER' && sharedViewer?.role === 'VIEWER' &&
      privateOwner?.role === 'OWNER' && !b.some(s => s.id === cfg.privateWorkspaceId) &&
      [sharedOwner, sharedViewer, privateOwner].every(s => s?.name.startsWith('QA - ')),
    'Os vínculos do Owner/Viewer ou os nomes dos espaços QA não correspondem ao teste.')

    const sharedPath = `/workspaces/${cfg.sharedWorkspaceId}/transactions`
    const privatePath = `/workspaces/${cfg.privateWorkspaceId}/transactions`
    const [asOwner, asViewer] = await Promise.all([
      apiJson(ownerToken, sharedPath, 'Leitura compartilhada Owner'),
      apiJson(viewerToken, sharedPath, 'Leitura compartilhada Viewer'),
    ])
    assert(JSON.stringify(asOwner.data) === JSON.stringify(asViewer.data),
      'Owner/Viewer receberam resultados diferentes no mesmo espaço QA.')

    const foreign = await api(viewerToken, privatePath)
    assert(foreign.status === 404, `Isolamento falhou: acesso a espaço privado retornou ${foreign.status}.`)

    // Mesmo com Owner AAL2, a migração HTTP deve continuar DESLIGADA.
    // Payload intencionalmente inválido: não há registros possíveis para importar.
    const disabled = await api(ownerToken, `/workspaces/${cfg.sharedWorkspaceId}/legacy-connect`, 'POST')
    assert(disabled.status === 403, `Trava de migração inesperada (${disabled.status}); interrompa QA.`)

    console.info('PASS: Supabase Auth Dev AAL2, API real, Owner/Viewer e isolamento.')
    console.info('PASS: migração HTTP permanece desativada. Nenhum registro financeiro gravado.')
  } finally {
    // Sempre revogar as sessões temporárias que o teste conseguiu abrir.
    await Promise.allSettled([owner.auth.signOut({ scope: 'local' }), viewer.auth.signOut({ scope: 'local' })])
    prompt.close()
  }
}

main().catch(error => {
  // Nunca escrever Error bruto: SDK/transportes podem conter dados pessoais.
  const detail = error instanceof QaStepError ||
    (error instanceof Error && error.message.startsWith('E2E não iniciado:')) ? error.message :
    'Confira a configuração Dev, a conectividade e as permissões das contas QA.'
  console.error('E2E Dev interrompido: ' + detail)
  process.exitCode = 1
})
