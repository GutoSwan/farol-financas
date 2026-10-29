<script setup lang="ts">
import { ref,computed,watch } from 'vue'
import MoneyInput from '../components/MoneyInput.vue'
import { useBills } from '../composables/useBills'
import { parseBRLToCents,formatBRL } from '../../domain/value-objects/Money'
import { changePercentage,getPreviousEntry } from '../../domain/services/billAnalytics'
import { currentYearMonth,formatYearMonth } from '../../shared/date'
const {bills,entries,error,addBill,saveEntry}=useBills()
const name=ref(''),dueDay=ref(10),selectedId=ref(''),month=ref(currentYearMonth()),amount=ref(''),status=ref<'paid'|'pending'>('pending'),message=ref(''),localError=ref('')
const history=computed(()=>entries.value.filter(e=>e.billId===selectedId.value).sort((a,b)=>b.yearMonth.localeCompare(a.yearMonth)))
const current=computed(()=>history.value.find(e=>e.yearMonth===month.value))
const previous=computed(()=>getPreviousEntry(entries.value,selectedId.value,month.value))
watch(bills,items=>{if(!items.some(i=>i.id===selectedId.value))selectedId.value=items[0]?.id??''},{immediate:true})
watch([selectedId,month],()=>{amount.value=current.value?formatBRL(current.value.amountCents):'';status.value=current.value?.status??'pending';message.value='';localError.value=''},{immediate:true})
function create(){message.value='';const id=addBill(name.value,Number(dueDay.value));if(id){selectedId.value=id;name.value='';dueDay.value=10;message.value='Conta cadastrada.'}}
function record(){localError.value='';message.value='';try{if(saveEntry(selectedId.value,month.value,parseBRLToCents(amount.value),status.value))message.value='Registro salvo.'}catch(e){localError.value=e instanceof Error?e.message:'Valor inválido'}}
function compare(a:number,b:number){const delta=changePercentage(a,b);return delta===null?'—':(delta>0?'+':'')+delta.toFixed(1).replace('.',',')+'%'}
</script>
<template><div class="heading"><div><p class="eyebrow">CONTAS RECORRENTES</p><h1>Contas mensais</h1><p>Registre um valor diferente a cada mês e acompanhe as variações.</p></div></div>
<div class="columns"><section class="panel"><div class="panel-title"><h2>Minhas contas</h2><b>{{bills.length}}</b></div>
<form class="form" @submit.prevent="create"><label>Nome da conta<input v-model="name" required minlength="2" maxlength="80" placeholder="Ex.: Energia elétrica"/></label><label>Dia de vencimento<input v-model.number="dueDay" type="number" min="1" max="31" required/></label><button class="dark">+ Cadastrar conta</button></form>
<div class="bill-list"><button v-for="bill in bills" :key="bill.id" type="button" :class="{selected:selectedId===bill.id}" @click="selectedId=bill.id"><b>{{bill.name}}</b><small>Vence dia {{bill.dueDay}}</small></button><p v-if="!bills.length">Nenhuma conta cadastrada.</p></div>
</section><section class="panel"><div class="panel-title"><h2>Registrar valor do mês</h2></div>
<form class="form" @submit.prevent="record"><label>Conta<select v-model="selectedId" :disabled="!bills.length" required><option disabled value="">Selecione</option><option v-for="bill in bills" :key="bill.id" :value="bill.id">{{bill.name}}</option></select></label><label>Mês de referência<input type="month" v-model="month" required/></label><label>Valor (R$)<MoneyInput v-model="amount" required placeholder="R$ 210,50" :disabled="!selectedId"/></label><label>Situação<select v-model="status"><option value="pending">Pendente</option><option value="paid">Pago</option></select></label><button class="primary" :disabled="!selectedId">{{current?'Atualizar registro':'Registrar valor'}}</button></form>
<p v-if="message" class="success" role="status">{{message}}</p><p v-if="error||localError" class="error" role="alert">{{localError||error}}</p>
<div v-if="current && previous" class="comparison"><span>Em comparação com {{formatYearMonth(previous.yearMonth)}}</span><strong>{{formatBRL(Math.abs(current.amountCents-previous.amountCents))}}</strong><b :class="current.amountCents>previous.amountCents?'up':'down'">{{compare(current.amountCents,previous.amountCents)}}</b></div>
</section></div>
<section class="panel history"><div class="panel-title"><div><h2>Histórico mensal</h2><p>Valores anteriores da conta selecionada</p></div></div><div v-if="!history.length" class="empty">Cadastre o primeiro valor para começar o histórico.</div><div v-else class="scroll"><table><thead><tr><th>Mês</th><th>Situação</th><th>Valor</th><th>Variação</th></tr></thead><tbody><tr v-for="(entry,index) in history" :key="entry.id"><td>{{formatYearMonth(entry.yearMonth)}}</td><td>{{entry.status==='paid'?'Pago':'Pendente'}}</td><td>{{formatBRL(entry.amountCents)}}</td><td :class="index<history.length-1 && entry.amountCents>history[index+1].amountCents?'up':'down'">{{index<history.length-1?compare(entry.amountCents,history[index+1].amountCents):'—'}}</td></tr></tbody></table></div></section>
</template>
