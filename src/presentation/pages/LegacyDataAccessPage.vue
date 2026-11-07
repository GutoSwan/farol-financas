<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../../infrastructure/auth/supabase'
import { claimLegacyData, localLegacyAccess } from '../../infrastructure/persistence/legacyAccess'
import type { LegacyAccess } from '../../infrastructure/persistence/legacyAccess'

const router = useRouter()
const userId = ref('')
const status = ref<LegacyAccess>('unavailable')
const busy = ref(true)
const error = ref('')
const confirmed = ref(false)

onMounted(async () => {
  if (!supabase) { busy.value = false; error.value = 'Autenticação indisponível.'; return }
  try {
    const { data, error: authError } = await supabase.auth.getUser()
    if (authError || !data.user) { await router.replace('/entrar'); return }
    userId.value = data.user.id
    status.value = localLegacyAccess(data.user.id)
    if (status.value === 'allowed') await router.replace('/')
  } catch { error.value = 'Não foi possível validar sua sessão.' }
  finally { busy.value = false }
})

async function claim(): Promise<void> {
  if (!confirmed.value || busy.value || status.value !== 'unclaimed' || !supabase) return
  busy.value = true
  error.value = ''
  try {
    const { data, error: authError } = await supabase.auth.getUser()
    if (authError || !data.user || data.user.id !== userId.value) throw new Error('Sua sessão mudou. Entre novamente.')
    claimLegacyData(userId.value)
    await router.replace('/')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Vinculação não concluída.'
  } finally { busy.value = false }
}

async function exit(): Promise<void> {
  if (!supabase || busy.value) return
  busy.value = true
  try {
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) throw signOutError
    await router.replace('/entrar')
  } catch { error.value = 'Não foi possível encerrar a sessão.' }
  finally { busy.value = false }
}
</script>

<template>
  <div class="auth-screen">
    <section class="auth-card" aria-label="Proteção dos dados locais">
      <div class="auth-brand">◈ Farol <span>Finanças</span></div>
      <p class="auth-kicker">PRIVACIDADE DOS DADOS LOCAIS</p>
      <h1>Registros deste navegador</h1>
      <p class="auth-subtitle">As informações financeiras antigas ficam neste navegador e ainda não estão associadas a uma conta na nuvem.</p>
      <p v-if="busy" role="status">Verificando acesso...</p>
      <template v-else-if="status === 'unclaimed' && !error">
        <div class="auth-warning">
          <p>Se estes registros são seus, você pode vinculá-los à conta autenticada. Faça isso somente em um dispositivo de confiança.</p>
          <p><strong>Aviso:</strong> o vínculo impede o acesso por outra conta na interface do Farol, mas os dados antigos ainda não estão criptografados no navegador.</p>
        </div>
        <label class="calendar-check">
          <input v-model="confirmed" type="checkbox" />
          Confirmo que tenho autorização para acessar os registros financeiros guardados neste navegador.
        </label>
        <button class="primary auth-full-button" type="button" :disabled="!confirmed || busy" @click="claim">
          Vincular dados locais à minha conta
        </button>
      </template>
      <template v-else-if="status === 'different-user'">
        <div class="auth-warning" role="alert">
          Estes dados locais já estão vinculados a outra conta neste navegador.
          Para proteger a privacidade, o Farol não vai mostrá-los nem transferi-los automaticamente.
        </div>
        <p class="auth-muted">Entre com a conta que vinculou os registros. A recuperação e migração entre contas exigirão um fluxo próprio.</p>
      </template>
      <p v-if="error || status === 'unavailable'" class="error" role="alert">
        {{ error || 'O armazenamento local está indisponível. Os dados existentes não foram apagados.' }}
      </p>
      <button class="secondary-action auth-full-button" type="button" :disabled="busy" @click="exit">Sair da conta</button>
    </section>
  </div>
</template>
