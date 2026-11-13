import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {summarizeMigrationSource,reviewMigrationDestination} from '../src/domain/services/migrationReview'
import type {LocalReviewSpace,DestinationInspection} from '../src/domain/services/migrationReview'
import type {OnlineWorkspace} from '../src/infrastructure/api/onlineWorkspaces'
import {DEFAULT_WORKSPACE} from '../src/domain/entities/FinancialWorkspace'
const source:LocalReviewSpace={
  workspace:DEFAULT_WORKSPACE,bills:[],monthlyEntries:[],fixedExpenses:[],
  transactions:[],budgets:{projects:[],items:[],quotes:[]},
}
const remote:OnlineWorkspace={id:'11111111-1111-4111-8111-111111111111',
  name:DEFAULT_WORKSPACE.name,role:'OWNER'}
const empty:DestinationInspection={workspaceId:remote.id,
  incomplete:false,counts:{transactions:0,'recurring-bills':0,'fixed-expenses':0,budgets:0}}
describe('Prévia da revisão de migração',()=>{
  it('conta cada categoria sem incluir presentes e senhas',()=>{
    const data=structuredClone(source)
    data.bills.push({id:'bill1',name:'Luz',dueDay:10,active:true,createdAt:'2026-11-12'})
    data.monthlyEntries.push({id:'entry1',billId:'bill1',yearMonth:'2026-11',
      amountCents:15000,status:'pending',paidAt:null})
    expect(summarizeMigrationSource(data).total).toBe(2)
    expect(summarizeMigrationSource(data).issues).toEqual([])
  })
  it('marca pagamento fixo sem data como impedimento',()=>{
    const data=structuredClone(source)
    data.fixedExpenses.push({id:'f1',name:'Internet',amountCents:10000,dueDay:5,startMonth:'2026-11',
      endBeforeMonth:null,paidMonths:['2026-11'],createdAt:'2026-11-12'})
    const result=summarizeMigrationSource(data)
    expect(result.paidWithoutDate).toBe(1)
    expect(result.issues.join()).toContain('sem data original')
  })
  it('detecta histórico referindo conta ausente e referência orçamentária inválida',()=>{
    const data=structuredClone(source)
    data.monthlyEntries.push({id:'month1',billId:'missing',yearMonth:'2026-11',
      amountCents:12,status:'paid',paidAt:null})
    data.transactions.push({id:'tx1',description:'Teste',category:'Geral',
      amountCents:15,kind:'expense',occurredOn:'2026-11-12',createdAt:'2026-11-12',
      budgetItemId:'missing'})
    const report=summarizeMigrationSource(data)
    expect(report.issues.some(i=>i.includes('histórico mensal'))).toBe(true)
    expect(report.issues.some(i=>i.includes('orçamento'))).toBe(true)
    expect(report.issues.some(i=>i.includes('pagamento'))).toBe(true)
  })
  it('bloqueia destino sem proprietário ou com nomes conflitantes',()=>{
    expect(reviewMigrationDestination(source,[source],{...remote,role:'EDITOR'},[remote],empty)
      .join()).toContain('não é proprietária')
    expect(reviewMigrationDestination(source,[source],{...remote,name:'Outro'},[remote],empty)
      .join()).toContain('diferentes')
    expect(reviewMigrationDestination(source,[source],remote,[remote,remote],empty)
      .join()).toContain('nomes repetidos')
  })
  it('exige consulta da nuvem e bloqueia destino ocupado/truncado',()=>{
    expect(reviewMigrationDestination(source,[source],remote,[remote],null).join())
      .toContain('Confira')
    expect(reviewMigrationDestination(source,[source],remote,[remote],
      {...empty,counts:{...empty.counts,transactions:1}}).join()).toContain('Já existem')
    expect(reviewMigrationDestination(source,[source],remote,[remote],
      {...empty,counts:{...empty.counts,budgets:50}}).join()).toContain('incompleta')
    expect(reviewMigrationDestination(source,[source],remote,[remote],empty)).toEqual([])
  })
  it('contagem exata aceita 50+ linhas sem confundir paginação com truncamento',()=>{
    const precise:DestinationInspection={...empty,exact:true,counts:{...empty.counts,transactions:51},
      extraCounts:{monthlyEntries:0,fixedPayments:0,budgetItems:0,budgetQuotes:0,legacyMappings:0}}
    const issues=reviewMigrationDestination(source,[source],remote,[remote],precise)
    expect(issues.join()).toContain('Já existem registros')
    expect(issues.join()).not.toContain('incompleta')
  })
  it('não declara destino vazio quando há filhos ou mapeamentos existentes',()=>{
    const extras={monthlyEntries:0,fixedPayments:0,budgetItems:0,budgetQuotes:0,legacyMappings:0}
    const child:DestinationInspection={...empty,exact:true,extraCounts:{...extras,monthlyEntries:3}}
    expect(reviewMigrationDestination(source,[source],remote,[remote],child).join()).toContain('históricos')
    const mapped:DestinationInspection={...empty,exact:true,extraCounts:{...extras,legacyMappings:1}}
    expect(reviewMigrationDestination(source,[source],remote,[remote],mapped).join()).toContain('correspondências')
    const missing:DestinationInspection={...empty,exact:true}
    expect(reviewMigrationDestination(source,[source],remote,[remote],missing).join()).toContain('incompleta')
  })
  it('não expõe uma ação de envio e mantém acesso protegido pela rota',()=>{
    const page=readFileSync(new URL('../src/presentation/pages/MigrationReviewPage.vue',import.meta.url),'utf8')
    const route=readFileSync(new URL('../src/router/index.ts',import.meta.url),'utf8')
    const backend=readFileSync(new URL('../backend/src/app.ts',import.meta.url),'utf8')
    expect(page).toContain('Transferir para a nuvem · em breve')
    expect(page).toContain('disabled title="Transferência ainda não liberada"')
    expect(page).not.toContain('legacy-connect')
    expect(page).not.toContain("method:'POST'")
    expect(page).toContain('confirmedOwner')
    expect(page).toContain('originalFingerprint')
    expect(route).toContain("path: 'revisar-migracao', component: MigrationReviewPage")
    expect(route).toContain("title: 'Revisar migração', requiresLegacyData: true")
    expect(backend).toContain('allowLegacyConnectionWrites: false')
  })
})
