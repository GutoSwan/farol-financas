<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

const props = withDefaults(defineProps<{ fallback?: string; homeTo?: string; homeLabel?: string }>(), {
  fallback: '/', homeTo: '/', homeLabel: 'Visão geral',
})
const router = useRouter()
const route = useRoute()

/** Voltar dentro do Farol; não voltar por engano a um site externo. */
function goBack(): void {
  const last = router.options.history.state.back
  if (typeof last === 'string' && last.startsWith('/') &&
      !last.startsWith('//') && last !== route.fullPath) {
    void router.push(last)
  } else {
    void router.push(route.path === props.fallback ? '/' : props.fallback)
  }
}
</script>

<template>
  <nav class="farol-back-navigation" aria-label="Navegação desta página">
    <button type="button" class="farol-back-button" @click="goBack">
      <span aria-hidden="true">←</span> Voltar
    </button>
    <RouterLink :to="props.homeTo" class="farol-home-link">{{ props.homeLabel }}</RouterLink>
  </nav>
</template>
