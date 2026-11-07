<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  beginTotpEnrollment, discardUnverifiedTotpFactor, getTotpAssurance,
  listVerifiedTotpFactors, verifyTotpCode,
} from '../../infrastructure/auth/totpMfa'
import { totpQrImageSource } from '../../infrastructure/auth/totpQrImage'

type PendingEnrollment = { factorId: string; qrSvg: string; secret: string }
const pending = ref<PendingEnrollment | null>(null)
const verifiedCount = ref(0)
const assurance = ref<string | null>(null)
const busy = ref(false)
const loading = ref(true)
const code = ref('')
const message = ref('')
const errorText = ref('')
const showSecret = ref(false)
const qrDisplayFailed = ref(false)

const qrImage = computed(() => pending.value ? totpQrImageSource(pending.value.qrSvg) : '')

function clearFeedback() {
  message.value = ''
  errorText.value = ''
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
}

async function refresh() {
  const [factors, aal] = await Promise.all([listVerifiedTotpFactors(), getTotpAssurance()])
  verifiedCount.value = factors.length
  assurance.value = aal.currentLevel
}

onMounted(async () => {
  try { await refresh() }
  catch (error) { errorText.value = safeError(error) }
  finally { loading.value = false }
})

async function beginEnrollment() {
  if (busy.value || pending.value) return
  clearFeedback()
  busy.value = true
  try {
    pending.value = await beginTotpEnrollment()
    showSecret.value = false
    qrDisplayFailed.value = false
    code.value = ''
  } catch (error) { errorText.value = safeError(error) }
  finally { busy.value = false }
}

async function confirmEnrollment() {
  if (!pending.value || busy.value) return
  clearFeedback()
  busy.value = true
  try {
    await verifyTotpCode(pending.value.factorId, code.value)
    pending.value = null
    code.value = ''
    await refresh()
    message.value = 'Autenticador ativado! A partir do próximo login, o código será obrigatório.'
  } catch (error) { errorText.value = safeError(error) }
  finally { busy.value = false }
}

async function cancelEnrollment() {
  if (!pending.value || busy.value) return
  busy.value = true
  const id = pending.value.factorId
  try {
    await discardUnverifiedTotpFactor(id)
    pending.value = null
    code.value = ''
    clearFeedback()
  } catch { errorText.value = 'Não foi possível cancelar o cadastro. Tente novamente.' }
  finally { busy.value = false }
}
</script>

<template>
  <section class="totp-settings" aria-labelledby="totp-title">
    <h2 id="totp-title">Autenticação em duas etapas</h2>
    <p>Proteja o login com um código do Google Authenticator, Microsoft Authenticator ou outro app TOTP.</p>

    <p v-if="loading" class="auth-muted">Verificando os autenticadores...</p>
    <template v-else>
      <p v-if="verifiedCount > 0" class="success" role="status">
        Proteção ativada: {{ verifiedCount }} autenticador{{ verifiedCount > 1 ? 'es' : '' }} cadastrado{{ verifiedCount > 1 ? 's' : '' }}.
        <span v-if="assurance === 'aal2'"> Esta sessão já foi verificada.</span>
      </p>
      <p v-else class="auth-muted">Nenhum autenticador cadastrado nesta conta.</p>

      <div v-if="pending" class="totp-enrollment">
        <p><strong>1.</strong> Abra o autenticador e escaneie este QR Code.</p>
        <img v-if="qrImage && !qrDisplayFailed" class="totp-qr" :src="qrImage"
          alt="QR Code para cadastrar o Farol no aplicativo autenticador"
          @error="qrDisplayFailed = true" />
        <p v-if="!qrImage || qrDisplayFailed" class="auth-muted" role="status">
          Não foi possível exibir o QR Code. Utilize a chave manual abaixo para concluir o cadastro com segurança.
        </p>
        <button type="button" class="auth-inline-link" :disabled="busy" @click="showSecret = !showSecret">
          {{ showSecret ? 'Ocultar chave manual' : 'Não consigo escanear: mostrar chave manual' }}
        </button>
        <p v-if="showSecret" class="totp-secret">{{ pending.secret }}</p>
        <p><strong>2.</strong> Digite o código de seis dígitos gerado pelo autenticador.</p>
        <form class="auth-form" @submit.prevent="confirmEnrollment">
          <label>Código do autenticador
            <input v-model.trim="code" type="text" inputmode="numeric" autocomplete="one-time-code"
              pattern="[0-9]{6}" maxlength="6" minlength="6" required :disabled="busy"
              placeholder="000000" aria-label="Código de seis dígitos" />
          </label>
          <button type="submit" class="primary auth-full-button" :disabled="busy">
            {{ busy ? 'Verificando...' : 'Confirmar e ativar' }}
          </button>
        </form>
        <button type="button" class="secondary-action auth-full-button" :disabled="busy" @click="cancelEnrollment">
          Cancelar cadastro
        </button>
      </div>
      <button v-else type="button" class="primary auth-full-button" :disabled="busy" @click="beginEnrollment">
        {{ verifiedCount ? 'Adicionar outro autenticador' : 'Ativar autenticador' }}
      </button>
    </template>

    <p v-if="message" class="success" role="status">{{ message }}</p>
    <p v-if="errorText" class="error" role="alert">{{ errorText }}</p>
    <small class="auth-muted">
      Guarde o acesso ao autenticador. O Supabase não fornece códigos de recuperação TOTP:
      cadastre outro dispositivo como alternativa. Nunca compartilhe o QR Code ou a chave manual.
    </small>
  </section>
</template>

<style scoped>
.totp-settings { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--border-color, #8885); }
.totp-settings h2 { font-size: 1.08rem; margin: 0 0 .5rem; }
.totp-settings p { line-height: 1.45; }
.totp-enrollment { display: grid; gap: .6rem; margin-top: .75rem; }
.totp-qr { display: block; width: min(220px, 100%); height: auto; margin: .25rem auto; background: white; padding: 10px; border-radius: 12px; }
.totp-secret { overflow-wrap: anywhere; font-family: monospace; font-size: .88rem; }
</style>
