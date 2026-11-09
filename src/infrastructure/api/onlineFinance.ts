import { supabase } from '../auth/supabase'
import { apiEndpoint } from './apiEndpoint'
import type { OnlineWorkspace } from './onlineWorkspaces'

export type OnlineFinanceKind = 'transactions' | 'recurring-bills' | 'fixed-expenses' | 'budgets'
export interface OnlineFinanceRecord {
  id: string
  workspaceId: string
  label: string
  amountCents?: number
  dueDay?: number
  /** Versão recebida do banco; futura edição deve enviar If-Match: \"N\". */
  version?: number
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Somente leitura. Não persiste nem mescla dados no navegador. */
export async function readOnlineFinance(workspace: OnlineWorkspace, kind: OnlineFinanceKind, expectedUserId: string): Promise<OnlineFinanceRecord[]> {
  if (!supabase) throw new Error('Supabase não configurado.')
  if (!uuidPattern.test(workspace.id)) throw new Error('Identificador do espaço online inválido.')
  if (!['OWNER', 'EDITOR', 'VIEWER'].includes(workspace.role)) throw new Error('Papel de acesso inválido.')
  if (!['transactions', 'recurring-bills', 'fixed-expenses', 'budgets'].includes(kind)) {
    throw new Error('Módulo financeiro inválido.')
  }
  // Garante que não reutilizamos acidentalmente uma sessão de outra conta.
  const { data: identity, error: identityError } = await supabase.auth.getUser()
  if (identityError || identity.user?.id !== expectedUserId) throw new Error('A sessão mudou. Entre novamente.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session || data.session.user.id !== expectedUserId) throw new Error('Sessão expirada.')
  let response: Response
  try {
    response = await fetch(apiEndpoint('/api/v1/workspaces/' + workspace.id + '/' + kind + '?limit=50'), {
      headers: { Authorization: 'Bearer ' + data.session.access_token },
      method: 'GET',
      cache: 'no-store',
      // O Preview usa a mesma origem e pode exigir o cookie da própria Vercel.
      // Com 'omit' a Vercel redireciona para login e o fetch falha. O proxy só
      // encaminha o Bearer Supabase, nunca os cookies do navegador ao backend.
      credentials: 'same-origin',
      redirect: 'error',
    })
  } catch {
    throw new Error('Não foi possível acessar a API online. Verifique a conexão e o CORS.')
  }
  if (response.status === 401) throw new Error('A sessão foi recusada pela API.')
  if (response.status === 403) throw new Error('O servidor exige autenticação em duas etapas.')
  if (response.status === 404) throw new Error('Espaço não encontrado ou sem permissão.')
  if (!response.ok) throw new Error('Consulta online indisponível.')
  const json: unknown = await response.json().catch(() => null)
  if (!json || typeof json !== 'object' || !('data' in json) || !Array.isArray(json.data)) {
    throw new Error('Resposta inesperada da API.')
  }
  const entries: unknown[] = json.data
  if (entries.length > 50) throw new Error('A API ultrapassou o limite de resultados.')
  return entries.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Registro inválido recebido.')
    const row = item as Record<string, unknown>
    if (typeof row.id !== 'string' || typeof row.workspaceId !== 'string' || row.workspaceId !== workspace.id) {
      throw new Error('A API retornou dados fora do espaço autorizado.')
    }
    const label = kind === 'transactions' ? row.description : kind === 'budgets' ? row.title : row.name
    if (typeof label !== 'string' || label.length > 160) throw new Error('Campo financeiro inesperado.')
    const record: OnlineFinanceRecord = { id: row.id, workspaceId: row.workspaceId, label }
    if (row.version !== undefined) {
      if (typeof row.version !== 'number' || !Number.isInteger(row.version) || row.version < 1 || row.version > 2147483647) {
        throw new Error('Versão de registro inválida recebida da API.')
      }
      record.version = row.version
    }
    if (kind === 'transactions' || kind === 'fixed-expenses' || kind === 'budgets') {
      const amount = kind === 'budgets' ? row.targetCents : row.amountCents
      if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) {
        throw new Error('Valor financeiro inesperado.')
      }
      record.amountCents = amount
    }
    if (kind === 'recurring-bills' || kind === 'fixed-expenses') {
      if (typeof row.dueDay !== 'number' || !Number.isInteger(row.dueDay) || row.dueDay < 1 || row.dueDay > 31) {
        throw new Error('Vencimento inválido.')
      }
      record.dueDay = row.dueDay
    }
    return record
  })
}
