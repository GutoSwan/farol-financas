<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listVerifiedTotpFactors, verifyTotpCode } from '../../infrastructure/auth/totpMfa'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { signOut } = useAuth()
const factorId = ref('')
const code = ref('')
const busy = ref(false)
const loading = ref(true)
const errorText = ref('')

onMounted(async () => {
  try {
    const factors = await listVerifiedTotpFactors()
    if (!factors.length) {
      errorText.value = 'Nenhum autenticador verificado foi encontrado. Saia e entre novamente.'
      return
    }
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
      <div class="auth-brand">◈ Farol <span>Finanças</span></div>
      <p class="auth-kicker">SEGURANÇA DA SUA CONTA</p>
      <h1>Confirmar identidade</h1>
      <p class="auth-subtitle">
        Sua senha foi aceita. Agora abra seu Authenticator e informe o código de seis dígitos.
        Esta etapa é obrigatória nesta conta antes de acessar as finanças.
      </p>
      <p v-if="loading" class="auth-muted">Consultando autenticação em duas etapas...</p>
      <form v-else-if="factorId" class="auth-form" @submit.prevent="submit">
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
      <p class="auth-muted">Não tem acesso ao seu autenticador? Para sua segurança, não é possível pular esta verificação.</p>
      <button type="button" class="secondary-action auth-full-button" :disabled="busy" @click="logout">
        Sair da conta
      </button>
    </div>
  </div>
</template>
