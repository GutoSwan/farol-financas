<script setup lang="ts">
import { ref, computed } from 'vue'
import StatCard from '../components/StatCard.vue'
import { useBills } from '../composables/useBills'
import { formatBRL } from '../../domain/value-objects/Money'
import { totalForMonth,paidForMonth } from '../../domain/services/billAnalytics'
import { currentYearMonth, formatYearMonth } from '../../shared/date'
const {bills,entries,error}=useBills()
const month=ref(currentYearMonth())
const visible=computed(()=>entries.value.filter(e=>e.yearMonth===month.value))
const total=computed(()=>totalForMonth(entries.value,month.value))
const paid=computed(()=>paidForMonth(entries.value,month.value))
</script>
<template><div class="heading"><div><p class="eyebrow">VISÃO GERAL</p><h1>Seu painel financeiro</h1><p>Organize suas contas e acompanhe os valores mês a mês.</p></div><label>Mês de referência<input type="month" v-model="month"/></label></div>
<div class="notice">Esta versão acompanha somente contas mensais cadastradas, não o saldo bancário.</div>
<p v-if="error" class="error">{{error}}</p>
<div class="stats">
<StatCard label="Registros do mês" :value="String(visible.length)" hint="Contas com valor informado"/>
<StatCard label="Total informado" :value="formatBRL(total)" hint="Pago e pendente"/>
<StatCard label="Total pago" :value="formatBRL(paid)" hint="Marcado como pago"/>
<StatCard label="Ainda pendente" :value="formatBRL(total-paid)" hint="Do valor registrado"/>
</div>
<section class="panel"><div class="panel-title"><div><h2>Contas de {{formatYearMonth(month)}}</h2><p>Histórico de valores cadastrados</p></div><RouterLink class="primary" to="/contas-mensais">Gerenciar contas</RouterLink></div>
<div v-if="!visible.length" class="empty">Nenhuma conta registrada neste mês.</div>
<div v-else class="scroll"><table><thead><tr><th>Conta</th><th>Vencimento</th><th>Situação</th><th>Valor</th></tr></thead><tbody>
<tr v-for="e in visible" :key="e.id"><td>{{bills.find(x=>x.id===e.billId)?.name??'Conta'}}</td><td>Dia {{bills.find(x=>x.id===e.billId)?.dueDay??'—'}}</td><td>{{e.status==='paid'?'Pago':'Pendente'}}</td><td>{{formatBRL(e.amountCents)}}</td></tr>
</tbody></table></div></section></template>
