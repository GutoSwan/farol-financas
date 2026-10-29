<script setup lang="ts">
withDefaults(defineProps<{ label: string; value: string; hint: string; tone?: 'neutral' | 'expense' | 'positive' }>(), { tone: 'neutral' })
</script>
<template>
  <article class="stat">
    <span>{{ label }}</span>
    <strong :class="{ 'expense-text': tone === 'expense', 'positive-text': tone === 'positive' }">{{ value }}</strong>
    <small>{{ hint }}</small>
  </article>
</template>
