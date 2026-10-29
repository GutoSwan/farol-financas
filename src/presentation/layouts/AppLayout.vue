<script setup lang="ts">
import { useRoute } from 'vue-router'
const route=useRoute()
const links=[['/','Visão geral'],['/contas-mensais','Contas mensais'],['/lancamentos','Lançamentos'],['/cartoes','Cartões de crédito'],['/orcamentos','Orçamentos'],['/relatorios','Relatórios']]
</script>
<template><div class="shell"><aside class="sidebar"><RouterLink to="/" class="brand">◈ Farol <span>Finanças</span></RouterLink><p class="section-label">SEU CONTROLE FINANCEIRO</p><nav><RouterLink v-for="[href,label] in links" :key="href" :to="href" :class="{active:route.path===href}">{{label}}</RouterLink></nav><p class="sidebar-foot">Protótipo • armazenamento local</p></aside><div class="main"><header class="topbar"><b>Farol Finanças</b><span>{{route.meta.title??'Visão geral'}}</span></header><main class="content"><RouterView/></main></div></div></template>
