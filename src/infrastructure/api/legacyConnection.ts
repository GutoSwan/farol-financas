import { supabase } from '../auth/supabase'
import { apiEndpoint } from './apiEndpoint'
import type { OnlineWorkspace } from './onlineWorkspaces'
import type { LocalReviewSpace } from '../../domain/services/migrationReview'

export interface LegacyConnectionSummary {
  status: 'completed'
  workspaceMapping: 'created' | 'reused'
  created: number
  reused: number
  total: number
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Migração deliberada e única. O navegador NÃO apaga nem substitui dados locais.
 * Autorização, isolamento de espaços, unicidade e atomicidade são do backend.
 */
export async function connectReviewedFinancialWorkspace(
  source: LocalReviewSpace,
  destination: OnlineWorkspace,
  expectedUserId: string,
  unknownPaidDatesConfirmed = false,
): Promise<LegacyConnectionSummary> {
  if (!supabase || !uuid.test(destination.id) || destination.role !== 'OWNER') {
    throw new Error('É necessário um espaço online de sua propriedade.')
  }
  if (source.workspace.name.trim().normalize('NFC').toLocaleLowerCase('pt-BR') !==
      destination.name.trim().normalize('NFC').toLocaleLowerCase('pt-BR')) {
    throw new Error('Origem e destino devem representar o mesmo espaço financeiro.')
  }
  const { data: identity, error: userError } = await supabase.auth.getUser()
  if (userError || identity.user?.id !== expectedUserId) {
    throw new Error('Sua conta mudou. Confira o login antes de transferir.')
  }
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session || data.session.user.id !== expectedUserId) {
    throw new Error('Sessão expirada. Entre novamente antes da transferência.')
  }
  // O usuário precisa reconhecer explicitamente que não temos a data original.
  if (source.fixedExpenses.some(f=>f.paidMonths.length>0) && !unknownPaidDatesConfirmed) {
    throw new Error('Confirme os meses pagos sem data exata antes de transferir.')
  }
  // Enviar somente este espaço. Nunca enviar o backup inteiro, presentes ou tokens.
  const payload = JSON.stringify(unknownPaidDatesConfirmed
    ? {...source,confirmUnknownFixedPaymentDates:true}
    : source)
  if (new TextEncoder().encode(payload).length > 90_000) {
    throw new Error('Os registros excedem o tamanho do lote. Nenhum dado foi enviado.')
  }
  let response: Response
  try {
    response = await fetch(apiEndpoint('/api/v1/workspaces/' + destination.id + '/legacy-connect'), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + data.session.access_token,
        'Content-Type': 'application/json',
      },
      body: payload,
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
    })
  } catch {
    throw new Error('Não foi possível confirmar a transferência. Atualize a conferência antes de tentar novamente.')
  }
  if (response.status === 403) {
    throw new Error('A transferência ainda está bloqueada no servidor. Nenhum dado foi confirmado.')
  }
  if (response.status === 404) {
    throw new Error('Este espaço online não pertence à sua conta. Nenhum dado foi confirmado.')
  }
  if (response.status === 409) {
    throw new Error('O destino já possui registros ou houve conflito. Não tente mesclar automaticamente.')
  }
  if (!response.ok) {
    throw new Error('Não foi possível confirmar a transferência. Atualize a conferência no banco.')
  }
  const json: unknown = await response.json().catch(() => null)
  if (!json || typeof json !== 'object' || !('data' in json)) {
    throw new Error('Resposta da transferência inesperada. Consulte a nuvem antes de repetir.')
  }
  const result: unknown = json.data
  if (!result || typeof result !== 'object') {
    throw new Error('Confirmação incompleta. Consulte a nuvem antes de repetir.')
  }
  const row = result as Record<string, unknown>
  if (row.status !== 'completed' || (row.workspaceMapping !== 'created' && row.workspaceMapping !== 'reused') ||
      !['created', 'reused', 'total'].every(key => typeof row[key] === 'number' &&
        Number.isSafeInteger(row[key]) && (row[key] as number) >= 0) ||
      (row.created as number) + (row.reused as number) !== row.total) {
    throw new Error('A confirmação recebida é inválida. Consulte a nuvem antes de repetir.')
  }
  return {
    status: 'completed', workspaceMapping: row.workspaceMapping,
    created: row.created as number, reused: row.reused as number, total: row.total as number,
  }
}
