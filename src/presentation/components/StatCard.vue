<script setup lang="ts">
defineProps<{ label:string;value:string;hint:string }>()
</script>
<template><article class="stat"><span>{{label}}</span><strong>{{value}}</strong><small>{{hint}}</small></article></template>
