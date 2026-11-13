<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { supabase } from '../../infrastructure/auth/supabase'
import { localLegacyAccess } from '../../infrastructure/persistence/legacyAccess'
import { subscribeFinancialUiReset } from '../composables/financialUiSession'
import { getOnlineIdentity, listOnlineWorkspaces } from '../../infrastructure/api/onlineWorkspaces'
import type { OnlineWorkspace } from '../../infrastructure/api/onlineWorkspaces'
import { inspectOnlineLegacyReadiness } from '../../infrastructure/api/legacyReadiness'
import { apiConfigured } from '../../infrastructure/api/apiEndpoint'
import { buildLocalFinancialBackup } from '../../application/use-cases/exportFinancialBackup'
import type { FinancialBackup } from '../../infrastructure/backup/encryptedFinancialBackup'
import { fingerprintFinancialBackup } from '../../infrastructure/backup/encryptedFinancialBackup'
import { summarizeMigrationSource, reviewMigrationDestination } from '../../domain/services/migrationReview'
import type { DestinationInspection } from '../../domain/services/migrationReview'
import { formatBRL } from '../../domain/value-objects/Money'

type ReviewDetail = { id:string; title:string; secondary:string; amount?:number }
type ReviewCategory = { label:string; records:ReviewDetail[] }

const snapshot=shallowRef<FinancialBackup|null>(null)
const ownerId=ref('')
const originalFingerprint=ref('')
const remoteSpaces=ref<OnlineWorkspace[]>([])
const localId=ref('')
const destinationId=ref('')
const inspection=ref<DestinationInspection|null>(null)
const loading=ref(true)
const checking=ref(false)
const errorText=ref('')
const reviewMessage=ref('')
const cloudUnavailable=ref(false)
let generation=0
let unsubscribe: (()=>void)|null=null

const selectedLocal=computed(()=>snapshot.value?.workspaces.find(
  entry=>entry.workspace.id===localId.value,
))
const selectedDestination=computed(()=>remoteSpaces.value.find(
  item=>item.id===destinationId.value,
))
const summary=computed(()=>selectedLocal.value? summarizeMigrationSource(selectedLocal.value):null)
const destinationIssues=computed(()=> selectedLocal.value?
  reviewMigrationDestination(selectedLocal.value,snapshot.value?.workspaces??[],
    selectedDestination.value,remoteSpaces.value,inspection.value):[])
const allIssues=computed(()=>[...(summary.value?.issues??[]),...destinationIssues.value])
const sourceTotal=computed(()=>selectedLocal.value?.transactions.reduce((sum,t)=>sum+
  (t.kind==='income'?t.amountCents:-t.amountCents),0)??0)
const sections=computed<ReviewCategory[]>(()=>{
  const local=selectedLocal.value
  if(!local)return []
  return [
    {label:'Lançamentos',records:local.transactions.map(t=>({
      id:t.id,title:t.description,secondary:t.category+' · '+t.occurredOn,
      amount:t.kind==='income'?t.amountCents:-t.amountCents,
    }))},
    {label:'Contas mensais',records:local.bills.map(b=>({
      id:b.id,title:b.name,secondary:'Vence dia '+b.dueDay,
    }))},
    {label:'Histórico mensal',records:local.monthlyEntries.map(e=>({
      id:e.id,title:e.yearMonth,secondary:e.status==='paid'?'Pago':'Pendente',
      amount:-e.amountCents,
    }))},
    {label:'Gastos fixos',records:local.fixedExpenses.map(f=>({
      id:f.id,title:f.name,secondary:'Vence dia '+f.dueDay,
      amount:-f.amountCents,
    }))},
    {label:'Projetos de orçamento',records:local.budgets.projects.map(p=>({
      id:p.id,title:p.title,secondary:p.category+' · '+p.status,amount:p.targetCents,
    }))},
    {label:'Itens de orçamento',records:local.budgets.items.map(i=>({
      id:i.id,title:i.title,secondary:'Item de projeto',amount:i.plannedCents??undefined,
    }))},
    {label:'Cotações',records:local.budgets.quotes.map(q=>({
      id:q.id,title:q.provider,secondary:'Cotação de orçamento',amount:q.amountCents,
    }))},
  ]
})
const remoteModules=[
  {key:'transactions' as const,label:'Lançamentos'},
  {key:'recurring-bills' as const,label:'Contas mensais'},
  {key:'fixed-expenses' as const,label:'Gastos fixos'},
  {key:'budgets' as const,label:'Projetos de orçamento'},
]
const remoteExtras=[
  {key:'monthlyEntries' as const,label:'Históricos mensais'},
  {key:'fixedPayments' as const,label:'Pagamentos fixos'},
  {key:'budgetItems' as const,label:'Itens de orçamento'},
  {key:'budgetQuotes' as const,label:'Cotações'},
  {key:'legacyMappings' as const,label:'Correspondências anteriores'},
]

function clearSensitive(): void {
  generation++
  snapshot.value=null
  ownerId.value=''
  originalFingerprint.value=''
  remoteSpaces.value=[]
  localId.value=''
  destinationId.value=''
  inspection.value=null
  cloudUnavailable.value=false
  loading.value=false
  checking.value=false
}
function expired():void {
  clearSensitive()
  errorText.value='Os dados podem ter mudado ou a sessão foi encerrada. Atualize a revisão antes de continuar.'
}
async function confirmedOwner(expected?:string):Promise<string> {
  if(!supabase)throw new Error('Autenticação indisponível.')
  const {data,error}=await supabase.auth.getUser()
  if(error||!data.user||(expected && data.user.id!==expected)){
    throw new Error('A sessão mudou. Entre novamente.')
  }
  const {data:assurance,error:assuranceError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if(assuranceError||assurance?.currentLevel!=='aal2'){
    throw new Error('Confirme o Authenticator antes de revisar dados financeiros.')
  }
  if(localLegacyAccess(data.user.id)!=='allowed'){
    throw new Error('Os registros deste navegador não estão vinculados à sua conta.')
  }
  return data.user.id
}
function sourceChanged():void {
  inspection.value=null
  reviewMessage.value=''
}
function destinationChanged():void {
  generation++
  sourceChanged()
}
async function loadReview():Promise<void>{
  clearSensitive()
  const seq=generation
  loading.value=true
  errorText.value=''
  reviewMessage.value=''
  try{
    const owner=await confirmedOwner()
    const local=buildLocalFinancialBackup()
    const fingerprint=await fingerprintFinancialBackup(local)
    // A falta da API NÃO impede a conferência local de uma conta já
    // autenticada com MFA AAL2, mas bloqueia qualquer afirmação sobre destino.
    let unavailable=!apiConfigured
    let remote:OnlineWorkspace[]=[]
    if(apiConfigured){
      const identity=await getOnlineIdentity().catch(()=>null)
      if(identity && identity.id!==owner)throw new Error('A API reconheceu uma conta diferente.')
      if(!identity) unavailable=true
      else {
        try { remote=await listOnlineWorkspaces() }
        catch { unavailable=true }
      }
    }
    if(await confirmedOwner(owner)!==owner ||
       await fingerprintFinancialBackup(buildLocalFinancialBackup())!==fingerprint){
      throw new Error('Os dados ou a conta mudaram durante a revisão.')
    }
    if(seq!==generation)return
    snapshot.value=local
    originalFingerprint.value=fingerprint
    ownerId.value=owner
    localId.value=local.activeWorkspaceId
    remoteSpaces.value=remote
    cloudUnavailable.value=unavailable
    reviewMessage.value=unavailable
      ? 'Registros locais disponíveis para conferência. A nuvem não pôde ser verificada neste ambiente; não há transferência habilitada.'
      : 'Dados carregados para conferência. Nenhuma transferência foi iniciada.'
  }catch(cause){
    if(seq===generation){
      clearSensitive()
      errorText.value=cause instanceof Error?cause.message:'Não foi possível preparar a revisão.'
    }
  }finally{if(seq===generation)loading.value=false}
}
async function inspectDestination():Promise<void>{
  const dest=selectedDestination.value
  const source=selectedLocal.value
  if(checking.value||loading.value||!dest||!source||!ownerId.value||dest.role!=='OWNER')return
  generation++
  const seq=generation
  checking.value=true
  inspection.value=null
  errorText.value=''
  reviewMessage.value=''
  try{
    const owner=await confirmedOwner(ownerId.value)
    if(await fingerprintFinancialBackup(buildLocalFinancialBackup())!==originalFingerprint.value){
      throw new Error('Os dados locais mudaram desde que a revisão começou.')
    }
    // Um GET único calcula a contagem EXATA no mesmo snapshot PostgreSQL.
    // Nenhum dado financeiro local é enviado ao servidor.
    const ready=await inspectOnlineLegacyReadiness(dest,owner)
    if(seq!==generation)return
    const counts:DestinationInspection['counts']={
      transactions:ready.counts.transactions,
      'recurring-bills':ready.counts.recurringBills,
      'fixed-expenses':ready.counts.fixedExpenses,
      budgets:ready.counts.budgetProjects,
    }
    if(await confirmedOwner(owner)!==owner ||
       await fingerprintFinancialBackup(buildLocalFinancialBackup())!==originalFingerprint.value){
      throw new Error('A conta ou os dados locais mudaram durante a consulta.')
    }
    if(seq!==generation || destinationId.value!==dest.id || localId.value!==source.workspace.id)return
    inspection.value={
      workspaceId:dest.id,counts,incomplete:false,exact:true,
      extraCounts:{
        monthlyEntries:ready.counts.monthlyEntries,
        fixedPayments:ready.counts.fixedPayments,
        budgetItems:ready.counts.budgetItems,
        budgetQuotes:ready.counts.budgetQuotes,
        legacyMappings:ready.counts.legacyMappings,
      },
    }
    reviewMessage.value='Contagem exata de nove tabelas concluída. Nenhum registro foi enviado ou alterado.'
  }catch(cause){
    if(seq===generation)errorText.value=cause instanceof Error?cause.message:
      'Não foi possível conferir o espaço da nuvem.'
  }finally{if(seq===generation)checking.value=false}
}
onMounted(()=>{
  unsubscribe=subscribeFinancialUiReset(expired)
  window.addEventListener('storage',expired)
  void loadReview()
})
onBeforeUnmount(()=>{
  window.removeEventListener('storage',expired)
  unsubscribe?.()
  clearSensitive()
})
</script>

<template>
  <div class="heading">
    <div>
      <p class="eyebrow">FAROL FINANÇAS · MIGRAÇÃO SEGURA</p>
      <h1>Revisar antes de transferir</h1>
      <p>Confira a origem, escolha o destino e veja os impedimentos antes de enviar dados à nuvem.</p>
    </div>
    <RouterLink to="/backup-financeiro" class="secondary-action">Voltar ao backup</RouterLink>
  </div>

  <div class="migration-banner" role="status">
    <strong>Modo de revisão · somente leitura</strong>
    <span>A transferência ainda está desativada. Esta tela não altera seus registros locais nem os dados na nuvem.</span>
  </div>

  <div v-if="loading" class="panel" role="status">Verificando login, Authenticator e dados financeiros...</div>
  <div v-else-if="errorText && !snapshot" class="panel">
    <p class="error" role="alert">{{ errorText }}</p>
    <button type="button" class="secondary-action" @click="loadReview">Tentar novamente</button>
  </div>
  <template v-else-if="snapshot">
    <div class="migration-pair">
      <section class="panel">
        <div class="migration-section-title">
          <span class="migration-index">1</span>
          <div><h2>De onde vêm os dados?</h2><p>Registros salvos neste navegador</p></div>
        </div>
        <label class="migration-label" for="migration-local">Espaço financeiro local</label>
        <select id="migration-local" v-model="localId" :disabled="checking" @change="sourceChanged">
          <option v-for="entry in snapshot.workspaces" :key="entry.workspace.id"
            :value="entry.workspace.id">{{ entry.workspace.name }}</option>
        </select>
        <div v-if="summary" class="migration-metrics">
          <div><strong>{{ summary.total }}</strong><small>Registros a revisar</small></div>
          <div><strong>{{ formatBRL(sourceTotal) }}</strong><small>Saldo dos lançamentos</small></div>
        </div>
        <p class="migration-hint">O saldo considera apenas os lançamentos, não as contas ou os orçamentos.</p>
      </section>

      <section class="panel">
        <div class="migration-section-title">
          <span class="migration-index">2</span>
          <div><h2>Para onde irão?</h2><p>Espaço existente no Supabase</p></div>
        </div>
        <label class="migration-label" for="migration-remote">Espaço online de destino</label>
        <select id="migration-remote" v-model="destinationId" :disabled="checking"
          @change="destinationChanged">
          <option value="">Escolha um espaço</option>
          <option v-for="space in remoteSpaces" :key="space.id" :value="space.id">
            {{ space.name }} · {{ space.role==='OWNER'?'Proprietário':space.role==='EDITOR'?'Editor':'Leitura' }}
          </option>
        </select>
        <p v-if="cloudUnavailable" class="migration-hint" role="status">
          Consulta à nuvem indisponível nesta Preview. Revise os registros locais; a comparação online ficará pendente.
        </p>
        <p v-else-if="!remoteSpaces.length" class="migration-hint">
          Esta conta não tem espaços online disponíveis. Não é possível transferir dados ainda.
        </p>
        <div class="migration-actions">
          <button type="button" class="secondary-action" :disabled="checking || !selectedDestination ||
            selectedDestination.role!=='OWNER'" @click="inspectDestination">
            {{ checking?'Conferindo registros...':'Comparar com a nuvem' }}
          </button>
          <button type="button" class="migration-refresh" :disabled="checking" @click="loadReview">
            Atualizar revisão
          </button>
        </div>
      </section>
    </div>

    <section class="panel migration-panel" aria-label="Detalhes dos dados locais">
      <div class="migration-section-title">
        <span class="migration-index">3</span>
        <div><h2>Conferir os registros</h2><p>Abra uma categoria para revisar nomes, valores e quantidades.</p></div>
      </div>
      <div v-if="summary" class="migration-category-grid">
        <div v-for="row in summary.lines" :key="row.label" class="migration-category">
          <strong>{{ row.count }}</strong><span>{{ row.label }}</span>
        </div>
      </div>
      <div class="migration-details">
        <details v-for="section in sections" :key="section.label" class="migration-detail">
          <summary><span>{{ section.label }}</span><strong>{{ section.records.length }}</strong></summary>
          <p v-if="!section.records.length" class="migration-hint">Nenhum registro nesta categoria.</p>
          <div v-else class="migration-detail-items">
            <div v-for="record in section.records" :key="record.id" class="migration-detail-row">
              <div><strong>{{ record.title }}</strong><small>{{ record.secondary }}</small></div>
              <span v-if="record.amount!==undefined">{{ formatBRL(record.amount) }}</span>
            </div>
          </div>
        </details>
      </div>
    </section>

    <section class="panel migration-panel" aria-label="Resultado da revisão">
      <div class="migration-section-title">
        <span class="migration-index">4</span>
        <div><h2>Resultado da conferência</h2><p>O Farol avisa antes de qualquer risco de duplicação ou perda.</p></div>
      </div>
      <p v-if="inspection?.exact" class="migration-hint" role="status">
        Consulta exata ao banco, sem limite de 50 registros. Os números mostram o estado do destino no momento da conferência.
      </p>
      <div v-if="inspection" class="migration-category-grid">
        <div v-for="module in remoteModules" :key="module.key" class="migration-category">
          <strong>{{ inspection.counts[module.key] }}{{ !inspection.exact && inspection.counts[module.key]>=50?'+':'' }}</strong>
          <span>{{ module.label }} na nuvem</span>
        </div>
        <template v-if="inspection.extraCounts">
          <div v-for="module in remoteExtras" :key="module.key" class="migration-category">
            <strong>{{ inspection.extraCounts[module.key] }}</strong>
            <span>{{ module.label }} na nuvem</span>
          </div>
        </template>
      </div>
      <p v-if="errorText" class="error" role="alert">{{ errorText }}</p>
      <p v-if="reviewMessage" class="migration-hint" role="status">{{ reviewMessage }}</p>
      <div v-if="allIssues.length" class="migration-issues">
        <strong>Questões que precisam de atenção</strong>
        <ul><li v-for="(issue,index) in allIssues" :key="index">{{ issue }}</li></ul>
      </div>
      <p v-else class="migration-good">
        Nenhum impedimento detectado nesta conferência. A migração ainda exige testes adicionais
        e confirmação de um backup antes de poder ser liberada.
      </p>
      <div class="migration-footer">
        <div><strong>Próxima etapa: autorizar a transferência</strong>
          <small>O envio só será liberado após testes completos e confirmação explícita do usuário.</small>
        </div>
        <button type="button" class="primary" disabled title="Transferência ainda não liberada">
          Transferir para a nuvem · em breve
        </button>
      </div>
    </section>
  </template>
</template>

<style scoped>
.migration-banner{border:1px solid var(--farol-border,#e4eaf1);border-left:4px solid var(--farol-wine,#87364d);background:var(--farol-card-muted,#f6f8fa);border-radius:12px;padding:16px 18px;display:grid;gap:5px;margin-bottom:22px;color:var(--farol-text,#1d293d)}
.migration-banner strong{font-size:13px}.migration-banner span{font-size:12px;color:var(--farol-muted,#68798d);line-height:1.55}
.migration-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-bottom:18px}
.migration-pair .panel,.migration-panel{min-width:0}
.migration-panel{margin-bottom:18px}
.migration-section-title{display:flex;align-items:flex-start;gap:12px;margin-bottom:21px}
.migration-section-title h2{margin:0 0 5px;font-size:18px;color:var(--farol-text,#1d293d)}
.migration-section-title p{margin:0;font-size:12px;line-height:1.5;color:var(--farol-muted,#68798d)}
.migration-index{flex:0 0 31px;width:31px;height:31px;display:grid;place-items:center;border-radius:10px;background:var(--farol-wine-soft,#f1e2e8);color:var(--farol-wine,#8e4058);font-weight:800}
.migration-label{display:block;margin:0 0 9px;font-size:12px;font-weight:750;color:var(--farol-text,#1d293d)}
.migration-pair select{background:var(--farol-card,#fff);color:var(--farol-text,#1d293d);border:1px solid var(--farol-border,#dce4ed);width:100%}
.migration-metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}
.migration-metrics div,.migration-category{min-width:0;background:var(--farol-card-muted,#f7f9fc);border:1px solid var(--farol-border,#e4eaf1);border-radius:11px;padding:14px;display:grid;gap:6px}
.migration-metrics strong{font-size:20px;color:var(--farol-text,#1d293d)}
.migration-metrics small,.migration-category span{font-size:11px;color:var(--farol-muted,#68798d);line-height:1.4}
.migration-hint{font-size:12px;color:var(--farol-muted,#68798d);line-height:1.6}
.migration-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:17px}
.migration-refresh{background:none;color:var(--farol-wine,#8e4058);padding:10px;min-height:38px}
.migration-category-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:19px}
.migration-category strong{font-size:23px;color:var(--farol-text,#1d293d)}
.migration-details{display:grid;gap:8px}
.migration-detail{border:1px solid var(--farol-border,#e4eaf1);border-radius:10px;overflow:hidden;background:var(--farol-card,#fff)}
.migration-detail summary{padding:13px 15px;display:flex;justify-content:space-between;gap:12px;cursor:pointer;color:var(--farol-text,#1d293d);font-size:13px;font-weight:700}
.migration-detail summary strong{color:var(--farol-wine,#8e4058)}
.migration-detail>.migration-hint{padding:0 15px 10px}
.migration-detail-items{padding:0 15px 8px;max-height:290px;overflow-y:auto}
.migration-detail-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--farol-border,#e4eaf1);font-size:12px}
.migration-detail-row div{display:grid;gap:4px;min-width:0}
.migration-detail-row strong{color:var(--farol-text,#1d293d);overflow-wrap:anywhere}
.migration-detail-row small{color:var(--farol-muted,#68798d)}
.migration-detail-row span{color:var(--farol-text,#1d293d);white-space:nowrap;font-weight:750}
.migration-issues{border:1px solid var(--farol-border,#e4eaf1);border-left:3px solid var(--farol-wine,#8e4058);background:var(--farol-card-muted,#f7f9fc);border-radius:10px;padding:16px;font-size:12px;color:var(--farol-text,#1d293d)}
.migration-issues ul{margin:10px 0 0;padding-left:18px;line-height:1.75}
.migration-good{border:1px solid var(--farol-border,#e4eaf1);border-radius:10px;padding:14px;font-size:12px;line-height:1.6;color:var(--farol-text,#1d293d)}
.migration-footer{margin-top:22px;display:flex;justify-content:space-between;align-items:center;gap:14px;border-top:1px solid var(--farol-border,#e4eaf1);padding-top:21px;flex-wrap:wrap}
.migration-footer div{display:grid;gap:5px}
.migration-footer strong{font-size:13px;color:var(--farol-text,#1d293d)}
.migration-footer small{max-width:420px;font-size:11px;line-height:1.5;color:var(--farol-muted,#68798d)}
.migration-footer .primary{background:var(--farol-wine,#8e4058)}
@media(max-width:850px){.migration-pair{grid-template-columns:1fr}}
@media(max-width:530px){.migration-metrics{grid-template-columns:1fr}.migration-detail-row{align-items:start;flex-direction:column}.migration-category-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
