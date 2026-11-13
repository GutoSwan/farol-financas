import { supabase } from '../auth/supabase'
import { apiEndpoint } from './apiEndpoint'
import type { OnlineWorkspace } from './onlineWorkspaces'

/** Apenas GET de contagens: não transmite backup nem registros locais à API. */
export interface LegacyReadinessCounts {
  transactions: number
  recurringBills: number
  monthlyEntries: number
  fixedExpenses: number
  fixedPayments: number
  budgetProjects: number
  budgetItems: number
  budgetQuotes: number
  legacyMappings: number
}
export interface ExactCloudReadiness {
  workspaceId: string
  exact: true
  state: 'empty' | 'occupied' | 'mapped'
  counts: LegacyReadinessCounts
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const COUNT_FIELDS: (keyof LegacyReadinessCounts)[] = [
  'transactions','recurringBills','monthlyEntries','fixedExpenses','fixedPayments',
  'budgetProjects','budgetItems','budgetQuotes','legacyMappings',
]
function asObject(v:unknown):Record<string,unknown>|null {
  return v!==null && typeof v==='object' && !Array.isArray(v) ? v as Record<string,unknown> : null
}
/**
 * Confere tanto a identidade local quanto a resposta da API: um token de
 * outro usuário ou uma resposta parcial nunca é tratado como espaço vazio.
 * A API executa NOVA verificação de OWNER e AAL2 no servidor.
 */
export async function inspectOnlineLegacyReadiness(
  workspace: OnlineWorkspace, expectedUserId:string,
):Promise<ExactCloudReadiness> {
  if(!supabase) throw new Error('Supabase não configurado.')
  if(!UUID.test(workspace.id)||!UUID.test(expectedUserId)){
    throw new Error('Identidade de migração inválida.')
  }
  if(workspace.role!=='OWNER') throw new Error('Somente o proprietário pode conferir esse destino.')
  const {data:identity,error:identityError}=await supabase.auth.getUser()
  if(identityError||identity.user?.id!==expectedUserId){
    throw new Error('A conta mudou. Entre novamente.')
  }
  const {data,error}=await supabase.auth.getSession()
  if(error||!data.session||data.session.user.id!==expectedUserId){
    throw new Error('Sua sessão expirou.')
  }
  let response:Response
  try {
    response=await fetch(apiEndpoint('/api/v1/workspaces/'+workspace.id+'/legacy-readiness'),{
      method:'GET',cache:'no-store',credentials:'same-origin',redirect:'error',
      headers:{Authorization:'Bearer '+data.session.access_token},
    })
  } catch {
    throw new Error('Não foi possível conferir o banco online. Verifique a conexão.')
  }
  if(response.status===401) throw new Error('Sessão recusada pelo servidor.')
  if(response.status===403) throw new Error('Confirme o Authenticator para revisar o destino.')
  if(response.status===404) throw new Error('Você não é proprietário deste espaço online.')
  if(!response.ok) throw new Error('A conferência exata está indisponível. Nenhuma transferência foi iniciada.')
  const envelope=asObject(await response.json().catch(()=>null))
  const body=asObject(envelope?.data)
  const values=asObject(body?.counts)
  if(!body||body.workspaceId!==workspace.id||body.exact!==true||!values||
    !['empty','occupied','mapped'].includes(String(body.state))||
    COUNT_FIELDS.some(key=>!Number.isSafeInteger(values[key])||(values[key] as number)<0)){
    throw new Error('O servidor retornou contagens incompletas ou inválidas.')
  }
  const counts=Object.fromEntries(COUNT_FIELDS.map(k=>[k,values[k]])) as unknown as LegacyReadinessCounts
  const correctState=counts.legacyMappings>0?'mapped':
    COUNT_FIELDS.some(k=>counts[k]>0)?'occupied':'empty'
  if(body.state!==correctState)throw new Error('O resultado da conferência está inconsistente.')
  return {workspaceId:workspace.id,exact:true,state:correctState,counts}
}
