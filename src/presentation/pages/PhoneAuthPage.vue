<script setup lang="ts">
import BackNavigation from '../components/BackNavigation.vue'
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import UiIcon from '../components/UiIcon.vue'
import { useTheme } from '../composables/useTheme'
import { authConfigured } from '../../infrastructure/auth/supabase'
import { phoneAuthEnabled, sendPhoneOtp, verifyPhoneOtp } from '../../infrastructure/auth/phoneAuth'
import type { PhoneFlow } from '../../infrastructure/auth/phoneAuth'

const props = defineProps<{ mode: PhoneFlow }>()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()
const phone = ref('')
const pendingPhone = ref('')
const code = ref('')
const stage = ref<'phone' | 'code'>('phone')
const busy = ref(false)
const message = ref('')
const errorText = ref('')
const lastSent = ref(0)

watch(() => props.mode, () => {
  stage.value = 'phone'
  code.value = ''
  pendingPhone.value = ''
  errorText.value = ''
  message.value = ''
})

function resetFeedback(): void {
  errorText.value = ''
  message.value = ''
}

async function requestCode(): Promise<void> {
  if (busy.value || !phoneAuthEnabled) return
  resetFeedback()
  if (Date.now() - lastSent.value < 60_000) {
    errorText.value = 'Aguarde 60 segundos antes de pedir outro código.'
    return
  }
  busy.value = true
  try {
    pendingPhone.value = await sendPhoneOtp(phone.value, props.mode)
    stage.value = 'code'
    lastSent.value = Date.now()
    code.value = ''
    message.value = 'Se o número puder receber códigos, enviaremos um SMS. Confira as mensagens recebidas.'
  } catch (cause) {
    errorText.value = cause instanceof Error ? cause.message : 'Não foi possível enviar o código.'
  } finally { busy.value = false }
}

async function confirm(): Promise<void> {
  if (busy.value || !phoneAuthEnabled) return
  resetFeedback()
  busy.value = true
  try {
    await verifyPhoneOtp(pendingPhone.value, code.value)
    code.value = ''
    // Router guard always requires existing TOTP (AAL2), or enrollment
    // if the account has no TOTP. SMS never replaces an existing MFA factor.
    await router.replace('/verificar-2fa')
  } catch (cause) {
    errorText.value = cause instanceof Error ? cause.message : 'Não foi possível conferir o código.'
  } finally { busy.value = false }
}
</script>

<template>
  <div class="auth-screen">
    <section class="auth-card auth-card--phone">
      <BackNavigation fallback="/entrar" />
      <RouterLink class="auth-brand" to="/entrar">◈ Farol <span>Finanças</span></RouterLink>
      <button type="button" class="auth-theme-button" :aria-label="isDark ? 'Ativar tema claro' : 'Ativar tema escuro'" :title="isDark ? 'Ativar tema claro' : 'Ativar tema escuro'" @click="toggleTheme">
        <UiIcon :name="isDark ? 'sun' : 'moon'" :size="19" />
      </button>
      <p class="auth-kicker">ACESSO SEGURO PELO CELULAR</p>

      <div class="auth-flow-tabs" role="navigation" aria-label="Tipo de acesso por celular">
        <RouterLink to="/entrar/celular" :class="{ active: mode === 'login' }">Entrar</RouterLink>
        <RouterLink to="/cadastro/celular" :class="{ active: mode === 'signup' }">Criar conta</RouterLink>
        <RouterLink to="/recuperar-celular" :class="{ active: mode === 'recovery' }">Recuperar</RouterLink>
      </div>

      <h1>{{ mode === 'signup' ? 'Criar conta com celular' : mode === 'recovery' ? 'Recuperar acesso por celular' : 'Entrar por celular' }}</h1>
      <p class="auth-subtitle">
        {{ mode === 'signup'
          ? 'Confirme o número por SMS para criar uma conta. Depois configure seu aplicativo autenticador.'
          : mode === 'recovery'
            ? 'Use um número previamente verificado na sua conta para entrar novamente. Seu 2FA continuará obrigatório.'
            : 'Receba um código SMS no número já vinculado ao seu cadastro.' }}
      </p>

      <div v-if="!phoneAuthEnabled || !authConfigured" class="auth-warning" role="status">
        <UiIcon name="info" :size="20" />
        <div>
          <strong>Autenticação por celular em preparação</strong>
          <p>O fluxo está implementado, mas depende da configuração de um provedor SMS e dos limites de segurança no Supabase Dev. Nenhum SMS será enviado até a ativação.</p>
          <RouterLink to="/entrar">Continuar com e-mail e senha</RouterLink>
        </div>
      </div>

      <template v-else-if="stage === 'phone'">
        <form class="auth-form" @submit.prevent="requestCode">
          <label for="phone-auth-number">Número de celular com DDD
            <input id="phone-auth-number" v-model.trim="phone" type="tel" autocomplete="tel-national"
              inputmode="tel" required :disabled="busy" maxlength="22" placeholder="(15) 99999-9999" />
          </label>
          <p class="auth-muted">Brasil (+55). O número deve ser seu. Não envie códigos para terceiros.</p>
          <button type="submit" class="primary auth-full-button" :disabled="busy">
            <UiIcon name="smartphone" :size="18" /> {{ busy ? 'Solicitando...' : 'Receber código por SMS' }}
          </button>
        </form>
      </template>
      <template v-else>
        <p class="auth-subtitle">Código enviado para o número informado. Nunca compartilhe o código recebido.</p>
        <form class="auth-form" @submit.prevent="confirm">
          <label for="phone-auth-code">Código SMS
            <input id="phone-auth-code" v-model.trim="code" type="text" autocomplete="one-time-code"
              inputmode="numeric" class="auth-otp-input" pattern="[0-9]{6,8}" maxlength="8" minlength="6"
              required :disabled="busy" placeholder="000000" />
          </label>
          <button type="submit" class="primary auth-full-button" :disabled="busy">Validar código e continuar</button>
        </form>
        <button type="button" class="auth-inline-link" :disabled="busy" @click="stage = 'phone'; resetFeedback()">
          Alterar número
        </button>
        <button type="button" class="auth-inline-link" :disabled="busy" @click="requestCode">Reenviar código</button>
      </template>

      <p v-if="message" class="success" role="status">{{ message }}</p>
      <p v-if="errorText" class="error" role="alert">{{ errorText }}</p>
      <div class="auth-footer">
        <small>SMS é usado apenas como primeiro fator. Se sua conta tiver um autenticador TOTP, ele continuará sendo exigido. Perder o autenticador não permite recuperar o segundo fator somente com SMS.</small>
        <div class="auth-links">
          <RouterLink to="/entrar">Entrar com e-mail</RouterLink>
          <RouterLink to="/recuperar-senha">Recuperar senha por e-mail</RouterLink>
        </div>
      </div>
    </section>
  </div>
</template>
