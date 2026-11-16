<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaces } from '../composables/useWorkspaces'
import { VALORA3D_WORKSPACE_ID } from '../../domain/entities/FinancialWorkspace'
import ComingSoonPage from './ComingSoonPage.vue'
import MaquininhaPage from './MaquininhaPage.vue'

const { currentWorkspace } = useWorkspaces()
const isValora = computed(() => currentWorkspace.value?.id === VALORA3D_WORKSPACE_ID ||
  currentWorkspace.value?.name.trim().replace(/\s+/g, '').toLocaleLowerCase('pt-BR') === 'valora3d')
</script>

<template>
  <MaquininhaPage v-if="isValora" />
  <ComingSoonPage v-else title="Cartões de crédito" />
</template>
