<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuth } from '../composables/useAuth'
import { phoneAuthEnabled, requestPhoneLink, confirmPhoneLink } from '../../infrastructure/auth/phoneAuth'

const { user } = useAuth()
const phone = ref('')
const pending = ref('')
const code = ref('')
const busy = ref(false)
const errorText = ref('')
const message = ref('')
const stage = ref<'phone' | 'code'>('phone')

const masked = computed(() => {
  const digits = (user.value?.phone ?? '').replace(/\D/g,'')
  return digits.length >= 10 ? '+55 •• •••••-' + digits.slice(-4) : ''
})

async function startLink(): Promise<void> {
  if (busy.value || !phoneAuthEnabled) return
  busy.value = true
  errorText.value = ''
  message.value = ''
  try {
    pending.value = await requestPhoneLink(phone.value)
    stage.value = 'code'
    code.value = ''
    message.value = 'Enviamos um SMS para confirmar que este número pertence a você.'
  } catch (cause) {
    errorText.value = cause instanceof Error ? cause.message : 'Não foi possível iniciar a confirmação.'
  } finally { busy.value = false }
}

async function verifyLink(): Promise<void> {
  if (busy.value || !phoneAuthEnabled) return
  busy.value = true
  errorText.value = ''
  message.value = ''
  try {
    await confirmPhoneLink(pending.value, code.value)
    code.value = ''
    pending.value = ''
    phone.value = ''
    stage.value = 'phone'
    message.value = 'Celular confirmado! Você poderá utilizar SMS como primeiro fator de acesso.'
  } catch (cause) {
    errorText.value = cause instanceof Error ? cause.message : 'Código de confirmação inválido.'
  } finally { busy.value = false }
}
</script>

<template>
  <section class="phone-link-panel" aria-labelledby="phone-link-title">
    <h2 id="phone-link-title">Celular de acesso e recuperação</h2>
    <p class="auth-muted">
      Associe um número somente à sua própria conta, após entrar com 2FA.
      O código SMS não substitui o aplicativo autenticador.
    </p>
    <p v-if="masked" class="auth-info">Celular associado: <strong>{{ masked }}</strong></p>
    <div v-if="!phoneAuthEnabled" class="auth-muted" role="status">
      Cadastro de celular disponível após configurar o provedor SMS no Supabase Dev.
    </div>
    <form v-else-if="stage === 'phone'" class="auth-form" @submit.prevent="startLink">
      <label>Número brasileiro com DDD
        <input v-model.trim="phone" type="tel" autocomplete="tel-national"
          inputmode="tel" maxlength="22" required :disabled="busy" placeholder="(15) 99999-9999" />
      </label>
      <button type="submit" class="secondary-action auth-full-button" :disabled="busy">
        {{ busy ? 'Enviando...' : masked ? 'Alterar celular vinculado' : 'Vincular celular' }}
      </button>
    </form>
    <form v-else class="auth-form" @submit.prevent="verifyLink">
      <label>Código recebido por SMS
        <input v-model.trim="code" type="text" inputmode="numeric" autocomplete="one-time-code"
          pattern="[0-9]{6,8}" minlength="6" maxlength="8" required :disabled="busy" />
      </label>
      <button type="submit" class="primary auth-full-button" :disabled="busy">Confirmar celular</button>
      <button type="button" class="auth-inline-link" :disabled="busy" @click="stage = 'phone'; pending = ''; code = ''">Cancelar</button>
    </form>
    <p v-if="message" class="success" role="status">{{ message }}</p>
    <p v-if="errorText" class="error" role="alert">{{ errorText }}</p>
  </section>
</template>
