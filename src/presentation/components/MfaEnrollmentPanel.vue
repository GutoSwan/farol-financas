<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../../infrastructure/auth/supabase'
import { allTotpFactors, isTotpCode, safeTotpQrImage, totpSetupAvailability, type TotpSetupAvailability } from '../../domain/auth/totpEnrollment'
import { useAuth } from '../composables/useAuth'

type SetupPhase = 'loading' | TotpSetupAvailability | 'pending' | 'error'
type Enrollment = { id: string; qrImage: string | null; secret: string }

const router = useRouter()
const { recoveringPassword, refreshLoginMfa } = useAuth()
const phase = ref<SetupPhase>('loading')
const enrollment = ref<Enrollment | null>(null)
const code = ref('')
const busy = ref(false)
const errorText = ref('')
let ownerId: string | null = null

function authClient() {
  if (!supabase) throw new Error('O Supabase não está configurado neste ambiente.')
  return supabase.auth
}

async function requireCurrentIdentity(): Promise<string> {
  if (recoveringPassword.value) throw new Error('Conclua primeiro a recuperação de senha.')
  const auth = authClient()
  const [{ data: sessionResult, error: sessionError }, { data: identity, error: identityError }] =
    await Promise.all([auth.getSession(), auth.getUser()])
  if (sessionError || identityError || !sessionResult.session || !identity.user ||
      sessionResult.session.user.id !== identity.user.id) {
    throw new Error('Sua sessão expirou. Entre novamente antes de configurar o autenticador.')
  }
  if (ownerId && ownerId !== identity.user.id) {
    throw new Error('A conta autenticada mudou. Inicie a configuração novamente.')
  }
  ownerId = identity.user.id
  return ownerId
}

function clearSecret(): void {
  enrollment.value = null
  code.value = ''
}

async function inspect(): Promise<void> {
  if (busy.value) return
  busy.value = true
  errorText.value = ''
  clearSecret()
  phase.value = 'loading'
  try {
    await requireCurrentIdentity()
    const { data, error } = await authClient().mfa.listFactors()
    if (error || !data) throw new Error('Não foi possível consultar seus autenticadores.')
    // `totp` traz apenas fatores confirmados; `all` também inclui os pendentes.
    const totpFactors = allTotpFactors(data.all)
    phase.value = totpSetupAvailability(totpFactors)
  } catch (cause) {
    phase.value = 'error'
    errorText.value = cause instanceof Error ? cause.message : 'Não foi possível consultar a segurança da conta.'
  } finally { busy.value = false }
}

async function beginEnrollment(): Promise<void> {
  if (busy.value || !['available', 'incomplete'].includes(phase.value)) return
  busy.value = true
  errorText.value = ''
  try {
    await requireCurrentIdentity()
    const auth = authClient()
    // A API não devolve novamente o segredo de um cadastro interrompido.
    // O usuário pede explicitamente para reiniciar e apagar só fatores incompletos.
    const { data: factors, error: factorError } = await auth.mfa.listFactors()
    if (factorError || !factors) throw new Error('Não foi possível consultar o estado do autenticador.')
    const totpFactors = allTotpFactors(factors.all)
    if (totpFactors.some(f => f.status === 'verified')) {
      phase.value = 'active'
      return
    }
    for (const factor of totpFactors.filter(f => f.status === 'unverified')) {
      const { error } = await auth.mfa.unenroll({ factorId: factor.id })
      if (error) throw new Error('Não foi possível reiniciar o cadastro anterior. Tente novamente.')
    }
    const { data, error } = await auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Farol Finanças' })
    if (error || !data?.id) throw new Error('Não foi possível criar o novo autenticador.')
    if (!data.totp?.secret) {
      await auth.mfa.unenroll({ factorId: data.id })
      throw new Error('O Supabase não forneceu a chave de segurança. Tente novamente.')
    }
    await requireCurrentIdentity()
    enrollment.value = { id: data.id, secret: data.totp.secret, qrImage: safeTotpQrImage(data.totp.qr_code) }
    phase.value = 'pending'
  } catch (cause) {
    clearSecret()
    phase.value = 'error'
    errorText.value = cause instanceof Error ? cause.message : 'Não foi possível iniciar a configuração.'
  } finally { busy.value = false }
}

async function confirmEnrollment(): Promise<void> {
  if (busy.value || phase.value !== 'pending' || !enrollment.value) return
  errorText.value = ''
  if (!isTotpCode(code.value)) {
    errorText.value = 'Digite os seis números do aplicativo autenticador.'
    return
  }
  busy.value = true
  try {
    await requireCurrentIdentity()
    const factorId = enrollment.value.id
    const { error } = await authClient().mfa.challengeAndVerify({ factorId, code: code.value.trim() })
    if (error) throw new Error('Código inválido ou expirado. Confira o aplicativo e tente novamente.')
    const { data: assurance, error: levelError } = await authClient().mfa.getAuthenticatorAssuranceLevel()
    if (levelError || assurance?.currentLevel !== 'aal2') {
      throw new Error('A segunda etapa ainda não foi confirmada. Verifique sua sessão.')
    }
    if (await refreshLoginMfa(true) !== 'ready') {
      throw new Error('Não foi possível validar a nova sessão protegida.')
    }
    clearSecret()
    phase.value = 'active'
  } catch (cause) {
    errorText.value = cause instanceof Error ? cause.message : 'Falha ao confirmar o autenticador.'
  } finally { busy.value = false }
}

async function cancelEnrollment(): Promise<void> {
  if (busy.value) return
  busy.value = true
  errorText.value = ''
  try {
    if (enrollment.value) {
      await requireCurrentIdentity()
      const auth = authClient()
      const { data: factors, error: factorError } = await auth.mfa.listFactors()
      if (factorError || !factors) throw new Error('Não foi possível verificar a configuração antes de cancelar.')
      const factor = allTotpFactors(factors.all).find(f => f.id === enrollment.value?.id)
      if (factor?.status === 'verified') {
        clearSecret()
        phase.value = 'active'
        return
      }
      if (factor?.status === 'unverified') {
        const { error } = await auth.mfa.unenroll({ factorId: factor.id })
        if (error) throw new Error('Não foi possível descartar a configuração incompleta.')
      }
    }
    clearSecret()
    await router.replace('/conta')
  } catch (cause) {
    errorText.value = cause instanceof Error ? cause.message : 'Não foi possível cancelar.'
  } finally { busy.value = false }
}

onMounted(() => { void inspect() })
onUnmounted(clearSecret)
</script>

<template>
  <section class="totp-setup" aria-label="Configuração do autenticador">
    <p v-if="phase === 'loading'" role="status">Verificando seus autenticadores...</p>

    <template v-else-if="phase === 'active'">
      <div class="totp-state" role="status">
        <strong>Autenticador ativo</strong>
        <p>Seu aplicativo autenticador foi confirmado. Nos próximos acessos, será solicitado o código de seis dígitos.</p>
      </div>
      <p class="totp-hint">Guarde uma forma de recuperar o acesso ao autenticador. A perda do dispositivo não pode liberar a conta sem verificar sua identidade.</p>
      <RouterLink class="secondary-action totp-action" to="/conta">Voltar ao perfil</RouterLink>
    </template>

    <template v-else-if="phase === 'available' || phase === 'incomplete'">
      <div v-if="phase === 'incomplete'" class="totp-state" role="status">
        <strong>Configuração anterior não concluída</strong>
        <p>Precisamos descartar a tentativa incompleta para gerar uma nova chave. Nenhum autenticador confirmado será removido.</p>
      </div>
      <p v-else>Use o Google Authenticator, Microsoft Authenticator ou outro aplicativo compatível para proteger sua conta.</p>
      <button type="button" class="primary totp-action" :disabled="busy" @click="beginEnrollment">
        {{ busy ? 'Aguarde...' : phase === 'incomplete' ? 'Reiniciar configuração' : 'Configurar autenticador' }}
      </button>
    </template>

    <template v-else-if="phase === 'pending' && enrollment">
      <ol class="totp-steps">
        <li>Abra o aplicativo autenticador no celular.</li>
        <li>Escaneie o QR Code abaixo ou cadastre a chave manualmente.</li>
        <li>Digite o código de seis números para ativar.</li>
      </ol>
      <div v-if="enrollment.qrImage" class="totp-qr">
        <img :src="enrollment.qrImage" alt="QR Code para cadastrar o autenticador" width="208" height="208" />
      </div>
      <p v-else class="totp-hint" role="status">O QR Code não foi disponibilizado. Use a chave manual abaixo.</p>
      <label class="totp-secret-label">Chave de configuração manual
        <code class="totp-secret" aria-label="Chave secreta do autenticador">{{ enrollment.secret }}</code>
      </label>
      <p class="totp-hint">Não compartilhe essa chave, nem faça capturas de tela. Ela será apagada desta página após a confirmação.</p>
      <form class="auth-form" @submit.prevent="confirmEnrollment">
        <label>Código do aplicativo autenticador
          <input v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code"
            pattern="[0-9]{6}" minlength="6" maxlength="6" required :disabled="busy"
            placeholder="000000" aria-label="Código de seis dígitos" class="auth-otp-input" />
        </label>
        <button type="submit" class="primary totp-action" :disabled="busy || !isTotpCode(code)">
          {{ busy ? 'Confirmando...' : 'Confirmar e ativar 2FA' }}
        </button>
      </form>
      <button type="button" class="secondary-action totp-action" :disabled="busy" @click="cancelEnrollment">
        Cancelar e descartar tentativa
      </button>
    </template>

    <button v-else-if="phase === 'error'" type="button" class="secondary-action totp-action" :disabled="busy" @click="inspect">
      Verificar novamente
    </button>
    <p v-if="errorText" role="alert" class="error">{{ errorText }}</p>
  </section>
</template>

<style scoped>
.totp-setup { display: grid; gap: 15px; min-width: 0; }
.totp-setup > p { margin: 0; line-height: 1.55; }
.totp-setup .totp-action { width: 100%; display: flex; justify-content: center; align-items: center; text-align: center; padding: 12px 14px; }
.totp-state { padding: 14px; border-radius: 10px; border: 1px solid var(--farol-border); background: var(--farol-card-muted); }
.totp-state strong { display: block; font-size: 15px; }
.totp-state p { margin: 7px 0 0; line-height: 1.55; font-size: 13px; }
.totp-steps { padding-left: 21px; margin: 0; line-height: 1.7; font-size: 13px; }
.totp-qr { width: 230px; max-width: 100%; padding: 10px; background: white; border-radius: 12px; margin: 0 auto; display: flex; justify-content: center; }
.totp-qr img { max-width: 100%; height: auto; aspect-ratio: 1; }
.totp-secret-label { display: grid; gap: 9px; font-size: 13px; font-weight: 700; }
.totp-secret { display: block; overflow-wrap: anywhere; user-select: all; padding: 13px; border: 1px solid var(--farol-border); border-radius: 9px; background: var(--farol-card-muted); font-size: 12px; font-weight: 600; }
.totp-hint { font-size: 12px; color: var(--farol-muted); }
.totp-setup .auth-form { margin: 0; }
</style>
