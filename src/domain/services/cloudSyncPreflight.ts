import type { FinancialBackup } from '../../infrastructure/backup/encryptedFinancialBackup'
import type { OnlineWorkspace, OnlineWorkspaceRole } from '../../infrastructure/api/onlineWorkspaces'
import type { OnlineFinanceKind } from '../../infrastructure/api/onlineFinance'
export const MODULES: readonly OnlineFinanceKind[] = ['transactions','recurring-bills','fixed-expenses','budgets']
export type Counts = Record<OnlineFinanceKind, number>
export interface RemoteSample { workspaceId: string; counts: Counts }
export type CloudPreflightStatus = 'missing' | 'ambiguous' | 'not-owner' | 'truncated' | 'occupied' | 'empty'
export interface CloudPreflightItem {
  name: string
  localId: string
  localCounts: Counts
  remoteCounts: Counts | null
  remoteRole: OnlineWorkspaceRole | null
  status: CloudPreflightStatus
  detail: string
}
export interface CloudPreflightReport {
  entries: CloudPreflightItem[]
  warnings: number
  canImport: false
}
export function normalizeName(value: string): string {
  return value.trim().normalize('NFC').toLocaleLowerCase('pt-BR')
}
export function inventory(local: FinancialBackup['workspaces'][number]): Counts {
  return {transactions:local.transactions.length,'recurring-bills':local.bills.length,
    'fixed-expenses':local.fixedExpenses.length,budgets:local.budgets.projects.length}
}
/**
 * Uma coincidência por NOME não estabelece identidade nem autoriza migração.
 * Contagens não garantem ausência de duplicatas. Nenhum dado é gravado.
 */
export function compareLocalAndCloud(
  local: FinancialBackup, remote: readonly OnlineWorkspace[], samples: readonly RemoteSample[],
): CloudPreflightReport {
  const sampleIndex=new Map(samples.map(s=>[s.workspaceId,s]))
  if(sampleIndex.size!==samples.length) throw new Error('A API retornou resultados repetidos.')
  const entries=local.workspaces.map((ws:FinancialBackup['workspaces'][number]):CloudPreflightItem=>{
    const base={name:ws.workspace.name,localId:ws.workspace.id,localCounts:inventory(ws)}
    const matching=remote.filter(r=>normalizeName(r.name)===normalizeName(ws.workspace.name))
    const fallback={remoteCounts:null,remoteRole:null}
    if(matching.length===0) return {...base,...fallback,status:'missing',detail:'Sem espaço online correspondente. Nenhuma associação foi criada.'}
    if(matching.length>1) return {...base,...fallback,status:'ambiguous',detail:'Nomes duplicados na nuvem. O espaço correto é ambíguo.'}
    const online=matching[0]
    if(online.role!=='OWNER') return {...base,...fallback,remoteRole:online.role,status:'not-owner',detail:'É necessário ser proprietário do espaço para futura importação.'}
    const sample=sampleIndex.get(online.id)
    if(!sample || MODULES.some(k=>!Number.isSafeInteger(sample.counts[k])||sample.counts[k]<0||sample.counts[k]>=50)) {
      return {...base,remoteRole:online.role,remoteCounts:sample?.counts??null,status:'truncated',detail:'A leitura não foi concluída ou atingiu o limite de 50 por módulo.'}
    }
    if(MODULES.some(k=>sample.counts[k]>0)) {
      return {...base,remoteRole:online.role,remoteCounts:sample.counts,status:'occupied',detail:'Já existem registros online; mesclar poderia criar duplicatas.'}
    }
    return {...base,remoteRole:online.role,remoteCounts:sample.counts,status:'empty',detail:'Módulos consultados vazios. Ainda não autoriza importação ou sincronização.'}
  })
  return {entries,warnings:entries.filter(x=>x.status!=='empty').length,canImport:false}
}
