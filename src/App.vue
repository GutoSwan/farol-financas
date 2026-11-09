<script setup lang="ts">
import { watch } from 'vue'
import InstallAppBanner from './presentation/components/InstallAppBanner.vue'
import { useAuth } from './presentation/composables/useAuth'
import { restoreThemeFromProfile } from './presentation/composables/useTheme'
import { cancelNativeCalendarNotifications, isNativeCalendar } from './infrastructure/notifications/nativeCalendar'

const { user, ready } = useAuth()

// Login ou troca de conta: recuperar a preferência salva no perfil, se existir.
// Logout não redefine o tema, e sem preferência online vale a escolha local.
watch(() => user.value?.id, () => {
  restoreThemeFromProfile(user.value?.user_metadata?.farol_theme)
}, { immediate: true })

// Ao abrir o app deslogado, cancelar possíveis lembretes nativos de sessões anteriores.
watch([() => ready.value, () => user.value?.id], ([isReady, currentId]) => {
  if (isReady && !currentId && isNativeCalendar()) {
    void cancelNativeCalendarNotifications().catch(() => undefined)
  }
}, { immediate: true })
</script>

<template><RouterView /><InstallAppBanner /></template>
