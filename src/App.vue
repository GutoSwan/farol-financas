<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InstallAppBanner from './presentation/components/InstallAppBanner.vue'
import { useAuth } from './presentation/composables/useAuth'
import { canAccessWithoutSession } from './router/authNavigation'
import { setVerifiedLocalUser } from './infrastructure/persistence/legacyAccess'
import { invalidateFinancialUiSession } from './presentation/composables/financialUiSession'
import { restoreThemeFromProfile } from './presentation/composables/useTheme'

const { user, ready, recoveringPassword } = useAuth()
const router = useRouter()
const route = useRoute()
const privateViewSuspended = ref(false)

// A rota pode já estar montada quando o Supabase emitir SIGNED_OUT em outra aba.
// Não esperar uma nova navegação para esconder dados financeiros locais.
const canRenderCurrentPage = computed(() =>
  canAccessWithoutSession(route.path) ||
  (ready.value && !!user.value?.id && !privateViewSuspended.value)
)

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
watch(() => user.value?.id ?? null, (currentId, previousId) => {
  restoreThemeFromProfile(user.value?.user_metadata?.farol_theme)
  if (!previousId || previousId === currentId || canAccessWithoutSession(route.path)) return

  // Logout ou mudança de conta: ocultar o componente ANTES da consulta assíncrona
  // do guard. A vinculação financeira local nunca acompanha outra identidade.
  privateViewSuspended.value = true
  setVerifiedLocalUser(null)
  invalidateFinancialUiSession()
  const previousPath = route.path
  void Promise.resolve().then(async () => {
    const nextPath = recoveringPassword.value
      ? '/redefinir-senha'
      : currentId ? '/dados-online' : '/entrar'
    try {
      await router.replace(nextPath)
      // Um guard pode cancelar o redirecionamento sem lançar exceção.
      // Não revelar a tela local antiga enquanto a rota continuar nela.
      if (router.currentRoute.value.path !== previousPath &&
          !router.currentRoute.value.matched.some(record => record.meta.requiresLegacyData)) {
        privateViewSuspended.value = false
      }
    } catch {
      // Manter o escudo até a pessoa entrar numa rota sem dados locais.
    }
  })
}, { immediate: true, flush: 'sync' })

watch(() => route.path, (path) => {
  // A pessoa consegue voltar ao login mesmo se o roteador cancelou a troca.
  if (canAccessWithoutSession(path)) privateViewSuspended.value = false
})
</script>

<template>
  <RouterView v-if="canRenderCurrentPage" />
  <main v-else class="farol-session-shield" role="status">
    <div class="farol-session-shield-content">
      <h1>Protegendo seus dados</h1>
      <p>Estamos verificando sua sessão antes de exibir informações financeiras.</p>
      <RouterLink to="/entrar">Ir para o login</RouterLink>
    </div>
  </main>
  <InstallAppBanner />
</template>

<style scoped>
.farol-session-shield {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--background, #f3f5f8);
  color: var(--text, #3b2738);
}
.farol-session-shield-content {
  max-width: 440px;
  text-align: center;
}
.farol-session-shield-content h1 { font-size: 1.45rem; }
.farol-session-shield-content p { line-height: 1.5; }
.farol-session-shield-content a { color: var(--primary, #823951); font-weight: 650; }
</style>
