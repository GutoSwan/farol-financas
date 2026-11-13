import type { FinancialBackup } from '../../infrastructure/backup/encryptedFinancialBackup'
import type { OnlineWorkspace } from '../../infrastructure/api/onlineWorkspaces'
import type { OnlineFinanceKind } from '../../infrastructure/api/onlineFinance'
import { normalizeName } from './cloudSyncPreflight'

export const REVIEW_KINDS: readonly OnlineFinanceKind[] = [
  'transactions', 'recurring-bills', 'fixed-expenses', 'budgets',
]

export type ReviewCounts = Record<OnlineFinanceKind, number>
export type LocalReviewSpace = FinancialBackup['workspaces'][number]
export interface DestinationInspection {
  workspaceId: string
  counts: ReviewCounts
  incomplete: boolean
  /** Contagem sem paginação obtida de um único snapshot no servidor. */
  exact?: boolean
  extraCounts?: {
    monthlyEntries: number
    fixedPayments: number
    budgetItems: number
    budgetQuotes: number
    legacyMappings: number
  }
}
export interface ReviewSummary {
  lines: Array<{ label:string; count:number }>
  total: number
  paidWithoutDate: number
  issues: string[]
}

/**
 * Mostra incompatibilidades ANTES de qualquer envio. O serviço de migração
 * permanece desativado independentemente do resultado desta análise.
 */
export function summarizeMigrationSource(source: LocalReviewSpace): ReviewSummary {
  const { bills, monthlyEntries, fixedExpenses, transactions, budgets } = source
  const lines=[
    {label:'Lançamentos',count:transactions.length},
    {label:'Contas mensais',count:bills.length},
    {label:'Históricos mensais',count:monthlyEntries.length},
    {label:'Gastos fixos',count:fixedExpenses.length},
    {label:'Projetos de orçamento',count:budgets.projects.length},
    {label:'Itens de orçamento',count:budgets.items.length},
    {label:'Cotações',count:budgets.quotes.length},
  ]
  const issues:string[]=[]
  if(lines.some(row=>row.count>25)) {
    issues.push('Há mais de 25 registros em uma categoria. Precisamos preparar a importação em lotes.')
  }
  const paidWithoutDate=fixedExpenses.reduce((sum,expense)=>sum+expense.paidMonths.length,0)
  if(paidWithoutDate>0) {
    issues.push(paidWithoutDate+' pagamento(s) de gasto fixo sem data original de quitação precisam de revisão.')
  }
  const unique=(rows:readonly {id:string}[],label:string)=>{
    if(new Set(rows.map(row=>row.id)).size!==rows.length){
      issues.push('Foram encontrados identificadores repetidos em '+label+'.')
    }
  }
  unique(bills,'contas mensais')
  unique(monthlyEntries,'históricos')
  unique(fixedExpenses,'gastos fixos')
  unique(transactions,'lançamentos')
  unique(budgets.projects,'projetos')
  unique(budgets.items,'itens de orçamento')
  unique(budgets.quotes,'cotações')
  const billIds=new Set(bills.map(bill=>bill.id))
  const months=new Set<string>()
  for(const entry of monthlyEntries){
    const key=JSON.stringify([entry.billId,entry.yearMonth])
    if(!billIds.has(entry.billId)||months.has(key)){
      issues.push('Há um histórico mensal com conta ausente ou mês duplicado.')
      break
    }
    months.add(key)
  }
  const projectIds=new Set(budgets.projects.map(p=>p.id))
  const itemIds=new Map(budgets.items.map(i=>[i.id,i.projectId]))
  if(budgets.items.some(i=>!projectIds.has(i.projectId)) ||
     budgets.quotes.some(q=>!itemIds.has(q.itemId)) ||
     transactions.some(tx=>
       (tx.budgetProjectId!==undefined&&!projectIds.has(tx.budgetProjectId)) ||
       (tx.budgetItemId!==undefined&&!itemIds.has(tx.budgetItemId)) ||
       (tx.budgetProjectId!==undefined&&tx.budgetItemId!==undefined&&
        itemIds.get(tx.budgetItemId)!==tx.budgetProjectId))) {
    issues.push('Alguns lançamentos, itens ou cotações têm vínculos de orçamento inconsistentes.')
  }
  if(monthlyEntries.some(e=>(e.status==='paid')!==(e.paidAt!==null))){
    issues.push('Há histórico mensal sem informação coerente de pagamento.')
  }
  return {lines,total:lines.reduce((sum,row)=>sum+row.count,0),paidWithoutDate,issues}
}

export function reviewMigrationDestination(
  source: LocalReviewSpace,
  allLocal:readonly LocalReviewSpace[],
  destination:OnlineWorkspace|undefined,
  allRemote:readonly OnlineWorkspace[],
  inspected:DestinationInspection|null,
): string[] {
  const issues:string[]=[]
  if(!destination) return ['Selecione um espaço na nuvem para comparar.']
  if(destination.role!=='OWNER') issues.push('Sua conta não é proprietária do espaço selecionado.')
  if(normalizeName(destination.name)!==normalizeName(source.workspace.name)){
    issues.push('Os nomes dos espaços são diferentes. Confirme a identidade antes de conectá-los.')
  }
  if(allLocal.filter(s=>normalizeName(s.workspace.name)===normalizeName(source.workspace.name)).length>1 ||
     allRemote.filter(s=>normalizeName(s.name)===normalizeName(destination.name)).length>1){
    issues.push('Há espaços com nomes repetidos. A ligação não pode ser determinada somente pelo nome.')
  }
  if(!inspected || inspected.workspaceId!==destination.id){
    issues.push('Confira os registros existentes neste espaço da nuvem.')
  }else if(inspected.incomplete || REVIEW_KINDS.some(kind=>
    !Number.isSafeInteger(inspected.counts[kind]) || inspected.counts[kind]<0 ||
    (!inspected.exact && inspected.counts[kind]>=50)) ||
    (inspected.exact && (!inspected.extraCounts ||
      Object.values(inspected.extraCounts).some(count=>!Number.isSafeInteger(count)||count<0)))){
    issues.push('A nuvem retornou uma consulta incompleta. Não é seguro concluir que o espaço está vazio.')
  }else if((inspected.extraCounts?.legacyMappings??0)>0){
    issues.push('Este espaço tem correspondências de migração anteriores. É necessária uma reconciliação antes de enviar registros.')
  }else if(REVIEW_KINDS.some(kind=>inspected.counts[kind]>0) ||
    (inspected.extraCounts && Object.values(inspected.extraCounts).some(count=>count>0))){
    issues.push('Já existem registros no espaço online, inclusive históricos ou itens vinculados. Uma importação sem mesclagem poderia duplicá-los.')
  }
  return issues
}
