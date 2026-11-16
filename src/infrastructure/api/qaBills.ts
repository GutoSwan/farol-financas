import { supabase } from '../auth/supabase'
import { apiEndpoint } from './apiEndpoint'
import type { OnlineWorkspace } from './onlineWorkspaces'

export const qaBillWritesEnabled =
  import.meta.env.VITE_FAROL_QA_DEV_ONLY === 'true' &&
  import.meta.env.VITE_FAROL_QA_TRANSACTION_WRITES_ENABLED === 'true'

export type QaBillInput = { name: string; dueDay: number; active: boolean }
export type QaMonthInput = { yearMonth: string; amountCents: number; status: 'PENDING' | 'PAID' }
export type QaBillTarget = { id: string; version: number }
type QaBillCommand =
  | { action: 'create'; input: QaBillInput }
  | { action: 'update'; billId: string; input: QaBillInput }
  | { action: 'upsert-month'; billId: string; input: QaMonthInput }
  | { action: 'delete-month'; billId: string; yearMonth: string }
  | { action: 'delete'; billId: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const qaSpaces: Record<string, string> = {
  '01c6765f-b873-420f-a5f2-68c54aa22500': 'QA - Casa compartilhada (Dev)',
  '153045ae-c200-40f9-9d3a-5e20b5c55e54': 'QA - Valora3D compartilhada (Dev)',
}
export function canWriteQaBills(space: OnlineWorkspace): boolean {
  return qaBillWritesEnabled && UUID.test(space.id) && qaSpaces[space.id] === space.name &&
    (space.role === 'OWNER' || space.role === 'EDITOR')
}
function verifyInput(input: QaBillInput): QaBillInput {
  const name = input.name.trim()
  if (name.length < 1 || name.length > 80 || !Number.isInteger(input.dueDay) ||
      input.dueDay < 1 || input.dueDay > 31 || typeof input.active !== 'boolean') {
    throw new Error('Preencha nome e dia do vencimento válidos.')
  }
  return { name, dueDay: input.dueDay, active: input.active }
}
function verifyMonth(input: QaMonthInput): QaMonthInput {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.yearMonth) ||
      !Number.isSafeInteger(input.amountCents) || input.amountCents < 0 ||
      input.amountCents > 2147483647 || !['PENDING','PAID'].includes(input.status)) {
    throw new Error('Preencha mês, valor e situação válidos.')
  }
  return input
}

async function mutate(
  workspace: OnlineWorkspace, userId: string, command: QaBillCommand, target?: QaBillTarget,
): Promise<void> {
  if (!supabase || !canWriteQaBills(workspace)) {
    throw new Error('Edição de contas mensais indisponível neste espaço QA.')
  }
  if (command.action !== 'create' &&
      (!target || !UUID.test(target.id) || command.billId !== target.id ||
       !Number.isInteger(target.version) || target.version < 1 || target.version > 2147483646)) {
    throw new Error('Atualize a consulta para obter a versão atual da conta.')
  }
  if (command.action === 'create' || command.action === 'update') {
    command.input = verifyInput(command.input)
  } else if (command.action === 'upsert-month') {
    command.input = verifyMonth(command.input)
  } else if (command.action === 'delete-month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(command.yearMonth)) {
    throw new Error('Mês inválido.')
  }
  const { data: identity, error: identityError } = await supabase.auth.getUser()
  if (identityError || identity.user?.id !== userId) throw new Error('A sessão mudou. Entre novamente.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session || data.session.user.id !== userId) throw new Error('Sessão expirada.')

  let response: Response
  try {
    response = await fetch(apiEndpoint('/api/v1/workspaces/' + workspace.id + '/recurring-bills'), {
      method: 'POST', cache: 'no-store', credentials: 'same-origin', redirect: 'error',
      headers: {
        Authorization: 'Bearer ' + data.session.access_token,
        'Content-Type': 'application/json',
        ...(target ? { 'If-Match': '"' + target.version + '"' } : {}),
      },
      body: JSON.stringify({ workspaceId: workspace.id, ...command }),
    })
  } catch {
    throw new Error('Falha de conexão. Consulte novamente antes de repetir a operação.')
  }
  if (response.status === 401) throw new Error('Sessão recusada pela API.')
  if (response.status === 409) throw new Error('Outra conta alterou este cadastro. Consulte novamente antes de editar.')
  if (response.status === 428) throw new Error('Versão obrigatória. Atualize a consulta.')
  if (response.status === 403 || response.status === 404) {
    const backend = response.headers.get('X-Farol-QA-Backend') === 'reached'
    throw new Error(backend
      ? 'A API não encontrou a conta ou recusou a operação QA.'
      : 'A rota de contas mensais não está disponível nesta Preview.')
  }
  if (response.status === 204 && command.action === 'delete') return
  if (!response.ok) throw new Error('A alteração não foi confirmada. Atualize a consulta antes de tentar novamente.')
  const json: unknown = await response.json().catch(() => null)
  if (!json || typeof json !== 'object' || !('data' in json) ||
      !json.data || typeof json.data !== 'object' || Array.isArray(json.data)) {
    throw new Error('Resposta inesperada da API. Confira a consulta.')
  }
  const record = json.data as Record<string, unknown>
  if (typeof record.id !== 'string' || !UUID.test(record.id) ||
      record.workspaceId !== workspace.id || !Number.isInteger(record.version) ||
      Number(record.version) < 1) {
    throw new Error('Resposta da API fora do espaço autorizado.')
  }
}

export function createQaBill(space: OnlineWorkspace, userId: string, input: QaBillInput) {
  return mutate(space, userId, { action: 'create', input })
}
export function updateQaBill(space: OnlineWorkspace, userId: string, target: QaBillTarget, input: QaBillInput) {
  return mutate(space, userId, { action: 'update', billId: target.id, input }, target)
}
export function saveQaMonth(space: OnlineWorkspace, userId: string, target: QaBillTarget, input: QaMonthInput) {
  return mutate(space, userId, { action: 'upsert-month', billId: target.id, input }, target)
}
export function deleteQaMonth(space: OnlineWorkspace, userId: string, target: QaBillTarget, yearMonth: string) {
  return mutate(space, userId, { action: 'delete-month', billId: target.id, yearMonth }, target)
}
export function deleteQaBill(space: OnlineWorkspace, userId: string, target: QaBillTarget) {
  return mutate(space, userId, { action: 'delete', billId: target.id }, target)
}
