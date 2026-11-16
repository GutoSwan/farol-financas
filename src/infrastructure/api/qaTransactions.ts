import { supabase } from '../auth/supabase'
import { apiEndpoint } from './apiEndpoint'
import type { OnlineWorkspace } from './onlineWorkspaces'

/** Exclusivo da Preview de desenvolvimento, nunca usado pelo fluxo local atual. */
export const qaTransactionWritesEnabled =
  import.meta.env.VITE_FAROL_QA_DEV_ONLY === 'true' &&
  import.meta.env.VITE_FAROL_QA_TRANSACTION_WRITES_ENABLED === 'true'

export interface QaTransactionInput {
  description: string
  category: string
  amountCents: number
  kind: 'EXPENSE' | 'INCOME'
  occurredOn: string
}
export interface QaTransactionRecord extends QaTransactionInput {
  id: string
  workspaceId: string
  version: number
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const qaNames = new Set(['QA - Casa compartilhada (Dev)', 'QA - Valora3D compartilhada (Dev)'])

function validateInput(input: QaTransactionInput): QaTransactionInput {
  const description = input.description.trim()
  const category = input.category.trim()
  if (description.length < 1 || description.length > 120 || category.length < 1 || category.length > 40 ||
      !Number.isSafeInteger(input.amountCents) || input.amountCents < 1 || input.amountCents > 2147483647 ||
      !['EXPENSE', 'INCOME'].includes(input.kind) || !/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) {
    throw new Error('Preencha descrição, categoria, valor e data válidos.')
  }
  return { description, category, amountCents: input.amountCents,
    kind: input.kind, occurredOn: input.occurredOn }
}
function validateRecord(json: unknown, workspaceId: string): QaTransactionRecord {
  if (!json || typeof json !== 'object' || !('data' in json)) throw new Error('Resposta inválida da API.')
  const row = json.data
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Registro inválido recebido.')
  const data = row as Record<string, unknown>
  if (typeof data.id !== 'string' || !UUID.test(data.id) || data.workspaceId !== workspaceId ||
      !Number.isInteger(data.version) || Number(data.version) < 1) {
    throw new Error('Resposta fora do espaço autorizado.')
  }
  const validated = validateInput(data as unknown as QaTransactionInput)
  return { ...validated, id: data.id, workspaceId, version: data.version as number }
}

async function mutateQaTransaction(
  workspace: OnlineWorkspace, expectedUserId: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  input?: QaTransactionInput, record?: { id: string; version: number },
): Promise<QaTransactionRecord | null> {
  if (!qaTransactionWritesEnabled || !supabase) throw new Error('Escrita QA desativada neste ambiente.')
  if (!UUID.test(workspace.id) || !qaNames.has(workspace.name) ||
      !['OWNER', 'EDITOR'].includes(workspace.role)) {
    throw new Error('Somente espaços compartilhados de teste podem ser alterados.')
  }
  if (method !== 'POST' &&
      (!record || !UUID.test(record.id) || !Number.isInteger(record.version) ||
       record.version < 1 || record.version > 2147483646)) {
    throw new Error('Atualize a consulta para obter a versão correta do registro.')
  }
  const payload = input ? validateInput(input) : undefined
  if ((method === 'POST' || method === 'PATCH') && !payload) throw new Error('Dados não informados.')
  const { data: identity, error: identityError } = await supabase.auth.getUser()
  if (identityError || identity.user?.id !== expectedUserId) throw new Error('A sessão mudou. Entre novamente.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session || data.session.user.id !== expectedUserId) throw new Error('Sessão expirada.')
  const url = '/api/v1/workspaces/' + workspace.id + '/transactions' +
    (record ? '/' + record.id : '')
  let response: Response
  try {
    response = await fetch(apiEndpoint(url), {
      method, cache: 'no-store', credentials: 'same-origin', redirect: 'error',
      headers: {
        Authorization: 'Bearer ' + data.session.access_token,
        ...(record ? { 'If-Match': '"' + record.version + '"' } : {}),
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    })
  } catch {
    throw new Error('Falha de conexão: nenhuma gravação foi confirmada. Consulte novamente antes de repetir.')
  }
  if (response.status === 401) throw new Error('Sessão recusada pela API.')
  if (response.status === 403 || response.status === 404) {
    // Distingue falha de rota da API de negativa de permissão sem expor dados.
    const reachedBackend = response.headers.get('X-Farol-QA-Backend') === 'reached'
    if (response.status === 403) {
      throw new Error(reachedBackend
        ? 'A API de testes recusou a edição (403).'
        : 'O acesso foi bloqueado antes de chegar à API de testes (403).')
    }
    throw new Error(reachedBackend
      ? 'A API de testes não encontrou o lançamento (404).'
      : 'A rota de edição ou exclusão não existe nesta Preview (404).')
  }
  if (response.status === 409) throw new Error('Outra conta alterou este lançamento. Atualize a consulta antes de editar.')
  if (response.status === 428) throw new Error('Versão obrigatória. Atualize a consulta.')
  if (method === 'DELETE' && response.status === 204) return null
  if (!response.ok) throw new Error('A gravação não foi confirmada. Confira a consulta antes de repetir.')
  const result = await response.json().catch(() => null)
  return validateRecord(result, workspace.id)
}

export function createQaTransaction(workspace: OnlineWorkspace, userId: string, input: QaTransactionInput) {
  return mutateQaTransaction(workspace, userId, 'POST', input)
}
export function updateQaTransaction(
  workspace: OnlineWorkspace, userId: string, record: { id: string; version: number }, input: QaTransactionInput,
) {
  return mutateQaTransaction(workspace, userId, 'PATCH', input, record)
}
export function deleteQaTransaction(
  workspace: OnlineWorkspace, userId: string, record: { id: string; version: number },
) {
  return mutateQaTransaction(workspace, userId, 'DELETE', undefined, record)
}
