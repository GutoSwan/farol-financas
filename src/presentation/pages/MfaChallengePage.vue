<script setup lang="ts">
import BackNavigation from '../components/BackNavigation.vue'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listVerifiedTotpFactors, verifyTotpCode } from '../../infrastructure/auth/totpMfa'
import { useAuth } from '../composables/useAuth'
import { supabase } from '../../infrastructure/auth/supabase'
import { activateTrustAfterMfa } from '../../infrastructure/auth/trustedComputer'

const router = useRouter()
const { signOut } = useAuth()
const factorId = ref('')
const knownFactors = ref<{ id: string; name: string }[]>([])
const showRecovery = ref(false)
const code = ref('')
const busy = ref(false)
const loading = ref(true)
const errorText = ref('')

onMounted(async () => {
  try {
    const factors = await listVerifiedTotpFactors()
    if (!factors.length) {
      // Um fator removido no Supabase exige novo cadastro após a senha.
      await router.replace('/configurar-2fa')
      return
    }
    knownFactors.value = factors.map((factor, index) => ({
      id: factor.id, name: factor.friendly_name || `Autenticador ${index + 1}`,
    }))
    factorId.value = factors[0].id
  } catch {
    errorText.value = 'Não foi possível consultar o autenticador. Verifique a conexão e tente novamente.'
  } finally { loading.value = false }
})

async function submit() {
  if (busy.value || !factorId.value) return
  busy.value = true
  errorText.value = ''
  try {
    await verifyTotpCode(factorId.value, code.value)
    if (supabase) {
      // Falha ao lembrar o dispositivo não altera o MFA já confirmado.
      try { await activateTrustAfterMfa(supabase.auth) } catch { /* sessão apenas na aba */ }
    }
    code.value = ''
    await router.replace('/')
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : 'Não foi possível verificar o código.'
  } finally { busy.value = false }
}

async function logout() {
  if (busy.value) return
  busy.value = true
  try {
    await signOut()
    await router.replace('/entrar')
  } catch {
    errorText.value = 'Não foi possível sair da conta. Tente novamente.'
  } finally { busy.value = false }
}
</script>

<template>
  <div class="auth-screen">
    <div class="auth-card">
      <BackNavigation fallback="/entrar" />
      <div class="auth-brand">◈ Farol <span>Finanças</span></div>
      <p class="auth-kicker">SEGURANÇA DA SUA CONTA</p>
      <h1>Confirmar identidade</h1>
      <p class="auth-subtitle">
        Sua senha foi aceita. Agora abra seu Authenticator e informe o código de seis dígitos.
        Esta etapa é obrigatória nesta conta antes de acessar as finanças.
      </p>
      <p v-if="loading" class="auth-muted">Consultando autenticação em duas etapas...</p>
      <form v-else-if="factorId" class="auth-form" @submit.prevent="submit">
        <label v-if="knownFactors.length > 1">Escolha o autenticador
          <select v-model="factorId" :disabled="busy">
            <option v-for="factor in knownFactors" :key="factor.id" :value="factor.id">{{ factor.name }}</option>
          </select>
        </label>
        <label>Código do autenticador
          <input v-model.trim="code" type="text" inputmode="numeric" autocomplete="one-time-code"
            pattern="[0-9]{6}" maxlength="6" minlength="6" required autofocus :disabled="busy"
            placeholder="000000" />
        </label>
        <button class="primary auth-full-button" type="submit" :disabled="busy">
          {{ busy ? 'Verificando...' : 'Verificar e entrar' }}
        </button>
      </form>
      <p v-if="errorText" class="error" role="alert">{{ errorText }}</p>
      <button type="button" class="auth-inline-link" :disabled="busy" @click="showRecovery = !showRecovery">
        Perdi o acesso ao autenticador
      </button>
      <div v-if="showRecovery" class="auth-warning" role="status">
        <strong>Recuperação do segundo fator</strong>
        <p>Remover uma conta do aplicativo no celular não remove o autenticador do Supabase. Se ele ainda estiver vinculado, a senha sozinha não permite cadastrar outro, pois isso deixaria o 2FA vulnerável.</p>
        <p>Primeiro, tente restaurar seu autenticador pelo backup do aplicativo ou usar outro autenticador já vinculado. Se não houver nenhum disponível, será necessária uma recuperação administrada com verificação de identidade. Depois que o fator antigo for removido no servidor, o Farol permitirá configurar um novo após entrar com a senha.</p>
        <p>Não compartilhe códigos, chaves TOTP ou QR Codes.</p>
      </div>
      <button type="button" class="secondary-action auth-full-button" :disabled="busy" @click="logout">
        Sair da conta
      </button>
    </div>
  </div>
</template>
