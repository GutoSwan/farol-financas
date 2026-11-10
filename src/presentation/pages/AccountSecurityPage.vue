<script setup lang="ts">
import BackNavigation from '../components/BackNavigation.vue'
import { useRoute } from 'vue-router'

const route = useRoute()
import TotpSettings from '../components/TotpSettings.vue'
import PhoneLinkPanel from '../components/PhoneLinkPanel.vue'
</script>

<template>
  <div class="account-security-page">
    <BackNavigation v-if="!route.path.startsWith('/administracao')" fallback="/conta" />
    <div class="heading">
      <div>
        <p class="eyebrow">PROTEÇÃO DA CONTA</p>
        <h1>Segurança e acesso</h1>
        <p>Gerencie seus métodos de acesso sem misturar com as opções do perfil.</p>
      </div>
    </div>
    <section class="panel account-security-intro">
      <h2>Como funciona?</h2>
      <p>O aplicativo autenticador protege suas informações com um código adicional. A recuperação por telefone ainda está em preparação.</p>
    </section>
    <TotpSettings />
    <PhoneLinkPanel />
  </div>
</template>
