import { z } from 'zod'

// Formato reconhecido exclusivamente para a PRIMEIRA migração de um espaço.
// Todos os valores financeiros são inteiros em centavos, nunca floats.
// Preservar espaços nos textos: mudar caracteres alteraria o SHA-256
// em relação ao manifesto assinado pelo navegador. Validar sem normalizar.
const key=z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/)
const timestamp=z.string().min(1).max(70).refine(v=>!Number.isNaN(Date.parse(v)))
const yearMonth=z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/)
const date=z.iso.date().refine(v=>{
  const x=new Date(v+'T00:00:00.000Z')
  return !Number.isNaN(x.getTime()) && x.toISOString().slice(0,10)===v
})
const cents=z.number().int().min(0).max(2147483647)
const due=z.number().int().min(1).max(31)
const workspace=z.object({
  id:key,name:z.string().min(1).max(60).refine(value=>value.trim().length>0),createdAt:timestamp,
}).strict()
const transaction=z.object({
  id:key,description:z.string().min(1).max(120).refine(value=>value.trim().length>0),
  category:z.string().min(1).max(40).refine(value=>value.trim().length>0),
  amountCents:cents.min(1),kind:z.enum(['income','expense']),
  occurredOn:date,createdAt:timestamp,
  budgetProjectId:key.optional(),budgetItemId:key.optional(),
}).strict()
const bill=z.object({
  id:key,name:z.string().min(1).max(80).refine(value=>value.trim().length>0),
  dueDay:due,active:z.boolean(),createdAt:timestamp,
}).strict()
const monthlyEntry=z.object({
  id:key,billId:key,yearMonth,amountCents:cents,
  status:z.enum(['paid','pending']),paidAt:timestamp.nullable(),
}).strict().refine(e=> (e.status==='paid')===(e.paidAt!==null),{message:'Histórico mensal inconsistente'})
const fixed=z.object({
  id:key,name:z.string().min(1).max(80).refine(value=>value.trim().length>0),amountCents:cents,
  dueDay:due,startMonth:yearMonth,endBeforeMonth:yearMonth.nullable(),
  paidMonths:z.array(yearMonth).max(120),createdAt:timestamp,
}).strict().refine(e=>!e.endBeforeMonth || e.endBeforeMonth>e.startMonth)
const project=z.object({
  id:key,title:z.string().min(1).max(120).refine(value=>value.trim().length>0),
  category:z.string().min(1).max(40).refine(value=>value.trim().length>0),
  targetCents:cents,status:z.enum(['planning','quoting','approved','in-progress','completed']),
  notes:z.string().max(4000),createdAt:timestamp,
}).strict()
const item=z.object({
  id:key,projectId:key,title:z.string().min(1).max(120).refine(value=>value.trim().length>0),
  plannedCents:cents.nullable(),createdAt:timestamp,
}).strict()
const quote=z.object({
  id:key,itemId:key,provider:z.string().min(1).max(120).refine(value=>value.trim().length>0),
  amountCents:cents,estimatedDays:z.number().int().min(0).max(36500).nullable(),
  materialsIncluded:z.boolean(),notes:z.string().max(4000),
  selected:z.boolean(),createdAt:timestamp,
}).strict()
const budgets=z.object({
  projects:z.array(project).max(25),
  items:z.array(item).max(25),
  quotes:z.array(quote).max(25),
}).strict()
const emptyBudgets={projects:[],items:[],quotes:[]}
export const legacyFinancialBatchSchema=z.object({
  workspace,
  transactions:z.array(transaction).max(25),
  bills:z.array(bill).max(25).default([]),
  monthlyEntries:z.array(monthlyEntry).max(25).default([]),
  fixedExpenses:z.array(fixed).max(25).default([]),
  budgets:budgets.default(emptyBudgets),
  // Confirmação explícita exigida só quando o legado não conhece a data exata.
  confirmUnknownFixedPaymentDates:z.boolean().optional(),
}).strict().superRefine((batch,ctx)=>{
  const checkUnique=(records:readonly {id:string}[],label:string)=>{
    if(new Set(records.map(r=>r.id)).size!==records.length){
      ctx.addIssue({code:'custom',message:'IDs duplicados: '+label})
    }
  }
  checkUnique(batch.transactions,'lançamentos')
  checkUnique(batch.bills,'contas')
  checkUnique(batch.monthlyEntries,'históricos')
  checkUnique(batch.fixedExpenses,'gastos fixos')
  checkUnique(batch.budgets.projects,'projetos')
  checkUnique(batch.budgets.items,'itens')
  checkUnique(batch.budgets.quotes,'cotações')
  const billIds=new Set(batch.bills.map(b=>b.id))
  const monthKey=new Set<string>()
  for(const entry of batch.monthlyEntries){
    const k=JSON.stringify([entry.billId,entry.yearMonth])
    if(!billIds.has(entry.billId)||monthKey.has(k)){
      ctx.addIssue({code:'custom',message:'Conta mensal inexistente ou competência repetida'})
    }
    monthKey.add(k)
  }
  const paidCount=batch.fixedExpenses.reduce((sum,fixed)=>sum+fixed.paidMonths.length,0)
  if(paidCount>25)ctx.addIssue({code:'custom',message:'Histórico pago excede o limite do lote'})
  if(paidCount>0 && batch.confirmUnknownFixedPaymentDates!==true){
    ctx.addIssue({code:'custom',message:'É necessário confirmar a preservação dos meses pagos sem data exata'})
  }
  for(const row of batch.fixedExpenses){
    const months=new Set<string>()
    for(const month of row.paidMonths){
      if(months.has(month) || month<row.startMonth ||
         (row.endBeforeMonth!==null && month>=row.endBeforeMonth)){
        ctx.addIssue({code:'custom',message:'Gasto fixo com competência paga repetida ou fora da vigência'})
      }
      months.add(month)
    }
  }
  const projectIds=new Set(batch.budgets.projects.map(p=>p.id))
  const itemParent=new Map(batch.budgets.items.map(i=>[i.id,i.projectId]))
  for(const i of batch.budgets.items){
    if(!projectIds.has(i.projectId))ctx.addIssue({code:'custom',message:'Item sem projeto'})
  }
  for(const q of batch.budgets.quotes){
    if(!itemParent.has(q.itemId))ctx.addIssue({code:'custom',message:'Cotação sem item'})
  }
  for(const tx of batch.transactions){
    if(tx.budgetProjectId && !projectIds.has(tx.budgetProjectId)){
      ctx.addIssue({code:'custom',message:'Lançamento com projeto ausente'})
    }
    if(tx.budgetItemId && !itemParent.has(tx.budgetItemId)){
      ctx.addIssue({code:'custom',message:'Lançamento com item ausente'})
    }
    if(tx.budgetProjectId && tx.budgetItemId &&
       itemParent.get(tx.budgetItemId)!==tx.budgetProjectId){
      ctx.addIssue({code:'custom',message:'Lançamento com item de outro projeto'})
    }
  }
})
export type LegacyFinancialBatch = z.infer<typeof legacyFinancialBatchSchema>
