<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div class="heading">
    <div>
      <p class="eyebrow">PRÓXIMAS ETAPAS</p>
      <h1>{{ title }}</h1>
      <p>Este módulo faz parte do planejamento do Farol.</p>
    </div>
  </div>
  <section class="panel empty">
    <h2>Em desenvolvimento</h2>
    <p>Por enquanto, você pode registrar despesas, receitas e contas mensais.</p>
    <RouterLink to="/lancamentos" class="primary">Abrir lançamentos</RouterLink>
  </section>
</template>
