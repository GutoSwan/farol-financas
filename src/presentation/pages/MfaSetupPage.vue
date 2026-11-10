<script setup lang="ts">
import BackNavigation from '../components/BackNavigation.vue'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../../infrastructure/auth/supabase'
import { getTotpAssurance, listVerifiedTotpFactors } from '../../infrastructure/auth/totpMfa'
import TotpSettings from '../components/TotpSettings.vue'

const router = useRouter()
const loading = ref(true)
const canEnroll = ref(false)
const busy = ref(false)
const errorText = ref('')

onMounted(async () => {
  if (!supabase) {
    errorText.value = 'A autenticação não está configurada.'
    loading.value = false
    return
  }
  try {
    const [{ data: identity, error }, factors, aal] = await Promise.all([
      supabase.auth.getUser(),
      listVerifiedTotpFactors(),
      getTotpAssurance(),
    ])
    if (error || !identity.user) {
      await router.replace('/entrar')
      return
    }
    if (factors.length > 0) {
      // Fator antigo registrado no servidor: nunca permitir substituição com AAL1.
      await router.replace(aal.currentLevel === 'aal2' ? '/' : '/verificar-2fa')
      return
    }
    canEnroll.value = true
  } catch {
    errorText.value = 'Não foi possível consultar o status do autenticador. Nenhum acesso financeiro foi liberado.'
  } finally {
    loading.value = false
  }
})

async function onActivated(): Promise<void> {
  if (!supabase || busy.value) return
  busy.value = true
  errorText.value = ''
  try {
    const [factors, aal] = await Promise.all([
      listVerifiedTotpFactors(), getTotpAssurance(),
    ])
    if (factors.length === 0 || aal.currentLevel !== 'aal2') {
      throw new Error('O segundo fator ainda não foi confirmado pelo Supabase.')
    }
    await router.replace('/')
  } catch (cause) {
    errorText.value = cause instanceof Error ? cause.message : 'Falha ao validar o segundo fator.'
  } finally { busy.value = false }
}

async function logout(): Promise<void> {
  if (!supabase || busy.value) return
  busy.value = true
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    await router.replace('/entrar')
  } catch {
    errorText.value = 'Não foi possível encerrar a sessão.'
  } finally { busy.value = false }
}
</script>

<template>
  <div class="auth-screen">
    <section class="auth-card">
      <BackNavigation fallback="/entrar" />
      <div class="auth-brand">◈ Farol <span>Finanças</span></div>
      <p class="auth-kicker">VERIFICAÇÃO DE SEGURANÇA</p>
      <h1>Configure o autenticador para continuar</h1>
      <p class="auth-subtitle">
        Sua senha foi aceita, mas o Supabase não encontrou um autenticador verificado nesta conta.
        Antes de abrir seus dados financeiros, cadastre um novo aplicativo autenticador e confirme o código.
      </p>
      <p v-if="loading" role="status" class="auth-muted">Verificando fatores no servidor...</p>
      <TotpSettings v-else-if="canEnroll" setup-only @activated="onActivated" />
      <p v-if="errorText" class="error" role="alert">{{ errorText }}</p>
      <button type="button" class="secondary-action auth-full-button" :disabled="busy" @click="logout">
        Sair da conta
      </button>
    </section>
  </div>
</template>
