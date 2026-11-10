<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import InstallAppBanner from './presentation/components/InstallAppBanner.vue'
import { useAuth } from './presentation/composables/useAuth'
import { restoreThemeFromProfile } from './presentation/composables/useTheme'

const { user, recoveringPassword } = useAuth()
const router = useRouter()

// O Supabase pode voltar pela Site URL padrão em vez de /redefinir-senha.
// Quando o token de recuperação é validado, abrir a tela de troca de senha
// sem navegar para a visão geral nem pedir o autenticador antes da troca.
watch(recoveringPassword, (isRecovery) => {
  if (!isRecovery) return
  void router.isReady().then(() => {
    if (router.currentRoute.value.path !== '/redefinir-senha') {
      return router.replace('/redefinir-senha')
    }
  })
}, { immediate: true })

// Login ou troca de conta: recuperar a preferência salva no perfil, se existir.
// Logout não redefine o tema, e sem preferência online vale a escolha local.
watch(() => user.value?.id, () => {
  restoreThemeFromProfile(user.value?.user_metadata?.farol_theme)
}, { immediate: true })
</script>

<template><RouterView /><InstallAppBanner /></template>
