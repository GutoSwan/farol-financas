<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import OnlineFinancePage from '../pages/OnlineFinancePage.vue'
import BackNavigation from '../components/BackNavigation.vue'

/**
 * Tela isolada: NUNCA inicializar useWorkspaces, AppLayout ou módulos locais.
 * A API verifica o JWT e o vínculo do usuário com cada espaço online.
 */
const router = useRouter()
const { user, signOut } = useAuth()
const busy = ref(false)
const errorText = ref('')

async function logout(): Promise<void> {
  if (busy.value) return
  busy.value = true
  errorText.value = ''
  try {
    await signOut()
    await router.replace('/entrar')
  } catch {
    errorText.value = 'Não foi possível sair da conta. Tente novamente.'
  } finally { busy.value = false }
}
</script>

<template>
  <div class="cloud-only-shell">
    <header class="cloud-only-header">
      <RouterLink to="/dados-online" class="cloud-only-brand">◈ Farol <span>Finanças</span></RouterLink>
      <BackNavigation fallback="/conta" />
      <nav class="cloud-only-nav" aria-label="Acesso protegido">
        <RouterLink to="/conta">Minha conta e segurança</RouterLink>
        <RouterLink to="/vincular-dados-locais">Dados deste navegador</RouterLink>
        <button type="button" :disabled="busy" @click="logout">{{ busy ? 'Saindo...' : 'Sair' }}</button>
      </nav>
    </header>
    <div class="cloud-only-content">
      <div class="cloud-only-alert" role="status">
        <strong>Modo seguro de dados na nuvem</strong>
        <p>Você está usando a conta {{ user?.email ?? 'atual' }}. Os registros locais de outro usuário permanecem protegidos e não são carregados, apagados, transferidos ou vinculados à sua conta.</p>
      </div>
      <p v-if="errorText" class="error" role="alert">{{ errorText }}</p>
      <main class="cloud-only-main">
        <OnlineFinancePage />
      </main>
    </div>
  </div>
</template>

<style scoped>
.cloud-only-shell { min-height: 100vh; background: var(--page-bg, #f1f4f8); color: var(--text-primary, #21324b); }
.cloud-only-header { padding: 1rem max(1.25rem, calc((100vw - 1100px) / 2)); display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; justify-content: space-between; background: var(--surface, #fff); border-bottom: 1px solid var(--border-color, #cbd5e1); }
.cloud-only-brand { font-weight: 800; font-size: 1.4rem; text-decoration: none; color: inherit; }
.cloud-only-brand span { color: #96435d; }
.cloud-only-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; font-size: .85rem; }
.cloud-only-nav a { color: inherit; }
.cloud-only-nav button { padding: .45rem .8rem; border: 1px solid var(--border-color, #cbd5e1); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
.cloud-only-content { max-width: 1100px; margin: 0 auto; padding: 1.5rem 1.25rem 4rem; }
.cloud-only-alert { padding: .85rem 1rem; border: 1px solid var(--border-color, #cbd5e1); border-radius: 12px; background: var(--surface, #fff); margin-bottom: 1.25rem; }
.cloud-only-alert p { margin: .35rem 0 0; font-size: .86rem; line-height: 1.55; }
.cloud-only-main { width: 100%; }
@media (max-width: 700px) { .cloud-only-header { align-items: flex-start; } .cloud-only-nav { gap: .7rem; } .cloud-only-content { padding: 1rem .8rem 3rem; } }
</style>
