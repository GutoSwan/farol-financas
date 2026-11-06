<script setup lang="ts">
import { watch } from 'vue'
import InstallAppBanner from './presentation/components/InstallAppBanner.vue'
import { useAuth } from './presentation/composables/useAuth'
import { restoreThemeFromProfile } from './presentation/composables/useTheme'

const { user } = useAuth()

// Login ou troca de conta: recuperar a preferência salva no perfil, se existir.
// Logout não redefine o tema, e sem preferência online vale a escolha local.
watch(() => user.value?.id, () => {
  restoreThemeFromProfile(user.value?.user_metadata?.farol_theme)
}, { immediate: true })
</script>

<template><RouterView /><InstallAppBanner /></template>
