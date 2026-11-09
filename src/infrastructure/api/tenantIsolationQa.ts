import { supabase } from '../auth/supabase'
import { apiEndpoint } from './apiEndpoint'
import { getOnlineIdentity, listOnlineWorkspaces } from './onlineWorkspaces'
import type { OnlineWorkspace } from './onlineWorkspaces'

/** QA IDs are public test identifiers, not credentials; only Preview receives them. */
const qaSpaceA = (import.meta.env.VITE_QA_SPACE_A_ID ?? '').trim()
const qaSpaceB = (import.meta.env.VITE_QA_SPACE_B_ID ?? '').trim()
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const qaIsolationEnabled = uuid.test(qaSpaceA) && uuid.test(qaSpaceB) &&
  qaSpaceA !== qaSpaceB

export type IsolationStatus = 'passed' | 'failed' | 'inconclusive'
export type QaModule = 'transactions' | 'recurring-bills' | 'fixed-expenses' | 'budgets'
export interface IsolationCheck { module: QaModule; status: IsolationStatus; httpStatus?: number }
export interface IsolationReport {
  own: 'A' | 'B'
  status: IsolationStatus
  checks: IsolationCheck[]
  message: string
}
const modules: QaModule[] = ['transactions', 'recurring-bills', 'fixed-expenses', 'budgets']

function chooseFixture(workspaces: OnlineWorkspace[], a: string, b: string): {
  own: 'A' | 'B'
  foreignId: string
} {
  const ownA = workspaces.some(w => w.id === a && w.name === 'QA - Conta atual')
  const ownB = workspaces.some(w => w.id === b && w.name === 'QA - Conta B')
  if (ownA && ownB) throw new Error('ALERTA: esta conta lista os dois espaços privados de QA. O isolamento falhou.')
  if (ownA) return { own: 'A', foreignId: b }
  if (ownB) return { own: 'B', foreignId: a }
  throw new Error('Esta conta não possui um espaço QA reconhecido. Teste indisponível.')
}

/**
 * Execute a live read-only IDOR/BOLA probe with the CURRENT user's real AAL2
 * Supabase session, against the opposite test workspace UUID.
 *
 * 404 => correct authorization denial.
 * 200 => security failure; do not parse or display the returned body.
 * 401/403/other => inconclusive (an expired JWT is NOT proof of isolation).
 * No tokens, keys or foreign content are persisted, printed or transmitted
 * anywhere beyond the authenticated, same-origin Farol API.
 */
export async function runTenantIsolationQa(
  expectedUserId: string,
  fixtureA = qaSpaceA,
  fixtureB = qaSpaceB,
): Promise<IsolationReport> {
  if (!uuid.test(fixtureA) || !uuid.test(fixtureB) || fixtureA === fixtureB) {
    throw new Error('IDs de teste indisponíveis ou inválidos.')
  }
  if (!supabase) throw new Error('Autenticação indisponível.')
  const { data: identity, error: identityError } = await supabase.auth.getUser()
  if (identityError || identity.user?.id !== expectedUserId) {
    throw new Error('Sua identidade mudou. Entre novamente.')
  }
  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || aal?.currentLevel !== 'aal2') {
    throw new Error('O teste exige sessão com 2FA confirmado.')
  }
  const { data: session, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session.session || session.session.user.id !== expectedUserId) {
    throw new Error('Sessão inválida. Entre novamente.')
  }
  const serverIdentity = await getOnlineIdentity()
  if (serverIdentity.id !== expectedUserId) {
    throw new Error('Identidade da API divergente. Teste interrompido.')
  }
  const workspaces = await listOnlineWorkspaces()
  const { own, foreignId } = chooseFixture(workspaces, fixtureA, fixtureB)

  const checks: IsolationCheck[] = []
  for (const module of modules) {
    try {
      const response = await fetch(
        apiEndpoint('/api/v1/workspaces/' + foreignId + '/' + module + '?limit=1'),
        { method: 'GET', cache: 'no-store', credentials: 'same-origin', redirect: 'error',
          headers: { Authorization: 'Bearer ' + session.session.access_token } },
      )
      // Deliberately do not parse, read, log or display an unauthorized payload.
      checks.push({ module, httpStatus: response.status,
        status: response.status === 404 ? 'passed' :
          response.status === 200 ? 'failed' : 'inconclusive' })
    } catch {
      checks.push({ module, status: 'inconclusive' })
    }
  }

  const status: IsolationStatus = checks.some(c => c.status === 'failed') ? 'failed' :
    checks.every(c => c.status === 'passed') ? 'passed' : 'inconclusive'
  return {
    own, checks, status,
    message: status === 'passed'
      ? 'A API negou as quatro consultas ao espaço da outra conta com HTTP 404.'
      : status === 'failed'
        ? 'FALHA DE SEGURANÇA: a API permitiu consultar um espaço de outra conta. Não cadastre dados reais.'
        : 'Teste inconclusivo. Apenas HTTP 404 comprova bloqueio do espaço alheio.',
  }
}
