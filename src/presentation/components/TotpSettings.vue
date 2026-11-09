<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../../infrastructure/auth/supabase'
import {
  beginTotpEnrollment, discardUnverifiedTotpFactor, getTotpAssurance,
  listVerifiedTotpFactors, removeVerifiedTotpFactor, verifyTotpCode,
} from '../../infrastructure/auth/totpMfa'
import { totpQrImageSource } from '../../infrastructure/auth/totpQrImage'

type Factor = Awaited<ReturnType<typeof listVerifiedTotpFactors>>[number]
type PendingEnrollment = { factorId: string; qrSvg: string; secret: string }

const props = withDefaults(defineProps<{ setupOnly?: boolean }>(), { setupOnly: false })
const emit = defineEmits<{ activated: [] }>()
const router = useRouter()
const pending = ref<PendingEnrollment | null>(null)
const factors = ref<Factor[]>([])
const assurance = ref<string | null>(null)
const busy = ref(false)
const loading = ref(true)
const code = ref('')
const message = ref('')
const errorText = ref('')
const showSecret = ref(false)
const qrDisplayFailed = ref(false)
const replacementId = ref<string | null>(null)
const removalId = ref<string | null>(null)
const confirmation = ref('')
const proofFactorId = ref('')
const proofCode = ref('')
const replacementRequestId = ref<string | null>(null)

const verifiedCount = computed(() => factors.value.length)
const canManage = computed(() => assurance.value === 'aal2' && !props.setupOnly)
const qrImage = computed(() => pending.value ? totpQrImageSource(pending.value.qrSvg) : '')

function clearFeedback(): void {
  message.value = ''
  errorText.value = ''
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
}

function factorName(factor: Factor, index: number): string {
  return factor.friendly_name?.trim() || `Autenticador ${index + 1}`
}

async function refresh(): Promise<void> {
  const [verified, aal] = await Promise.all([listVerifiedTotpFactors(), getTotpAssurance()])
  factors.value = verified
  assurance.value = aal.currentLevel
}

onMounted(async () => {
  try { await refresh() }
  catch (error) { errorText.value = safeError(error) }
  finally { loading.value = false }
})

async function beginEnrollment(replaceFactorId: string | null = null): Promise<void> {
  if (busy.value || pending.value) return
  clearFeedback()
  busy.value = true
  try {
    const [verified, aal] = await Promise.all([listVerifiedTotpFactors(), getTotpAssurance()])
    // Uma senha (AAL1) nunca substitui um segundo fator ainda cadastrado.
    if (verified.length > 0 && (aal.currentLevel !== 'aal2' || props.setupOnly)) {
      throw new Error('Confirme seu autenticador atual antes de adicionar ou substituir outro.')
    }
    if (replaceFactorId && !verified.some((factor) => factor.id === replaceFactorId)) {
      throw new Error('Autenticador antigo não encontrado. Atualize a página.')
    }
    if (replaceFactorId && !window.confirm(
      'Primeiro você cadastrará e verificará um novo autenticador. Somente depois o antigo será removido. Você precisará entrar novamente. Deseja continuar?'
    )) return
    replacementId.value = replaceFactorId
    pending.value = await beginTotpEnrollment()
    showSecret.value = false
    qrDisplayFailed.value = false
    code.value = ''
  } catch (error) { errorText.value = safeError(error) }
  finally { busy.value = false }
}

async function signOutAndReturnToLogin(): Promise<void> {
  // Após trocar ou remover um fator, invalidar a sessão local e solicitar login
  // novamente para reavaliar AAL com o estado atualizado do Supabase.
  if (supabase) {
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) {
      // Caso o fator já tenha invalidado a sessão, o roteador ainda consulta
      // o Supabase e não permite abrir dados financeiros com AAL1.
      await supabase.auth.signOut({ scope: 'local' })
    }
  }
  await router.replace('/entrar')
}

async function confirmEnrollment(): Promise<void> {
  if (!pending.value || busy.value) return
  clearFeedback()
  busy.value = true
  try {
    const newId = pending.value.factorId
    await verifyTotpCode(newId, code.value)
    // O novo autenticador é verificado ANTES de qualquer exclusão do antigo.
    pending.value = null
    code.value = ''
    showSecret.value = false
    const oldId = replacementId.value
    replacementId.value = null
    await refresh()
    if (oldId) {
      try {
        if (!factors.value.some((factor) => factor.id === newId)) {
          throw new Error('O novo autenticador ainda não aparece como verificado.')
        }
        await removeVerifiedTotpFactor(oldId)
        await signOutAndReturnToLogin()
      } catch (error) {
        // Falha na remoção: conservar os DOIS dispositivos e informar claramente.
        message.value = 'O novo autenticador foi ativado. O antigo não foi removido; ambos podem continuar vinculados até você removê-lo manualmente.'
        errorText.value = safeError(error)
        await refresh()
      }
      return
    }
    message.value = 'Autenticador ativado! Na próxima entrada, use o código do aplicativo.'
    if (assurance.value === 'aal2') emit('activated')
  } catch (error) { errorText.value = safeError(error) }
  finally { busy.value = false }
}

async function cancelEnrollment(): Promise<void> {
  if (!pending.value || busy.value) return
  busy.value = true
  const id = pending.value.factorId
  try {
    await discardUnverifiedTotpFactor(id)
    pending.value = null
    replacementId.value = null
    code.value = ''
    showSecret.value = false
    clearFeedback()
  } catch { errorText.value = 'Não foi possível cancelar o cadastro. Tente novamente.' }
  finally { busy.value = false }
}

function requestReplacement(id: string): void {
  if (!canManage.value || busy.value || pending.value) return
  clearFeedback()
  replacementRequestId.value = id
  proofFactorId.value = factors.value[0]?.id ?? ''
  proofCode.value = ''
}

async function authorizeReplacement(): Promise<void> {
  const id = replacementRequestId.value
  if (!id || busy.value || !proofFactorId.value) return
  busy.value = true
  clearFeedback()
  try {
    // Revalidar posse de um dos fatores ativos antes de substituí-lo.
    await verifyTotpCode(proofFactorId.value, proofCode.value)
    replacementRequestId.value = null
    proofCode.value = ''
    busy.value = false
    await beginEnrollment(id)
  } catch (error) { errorText.value = safeError(error) }
  finally { busy.value = false }
}

function chooseRemoval(id: string): void {
  if (!canManage.value || busy.value || pending.value) return
  clearFeedback()
  removalId.value = id
  confirmation.value = ''
  proofFactorId.value = factors.value[0]?.id ?? ''
  proofCode.value = ''
}

async function confirmRemoval(): Promise<void> {
  const id = removalId.value
  if (!id || confirmation.value !== 'REMOVER' || busy.value || !canManage.value) return
  clearFeedback()
  busy.value = true
  try {
    // Confirmar a posse de um autenticador com código NOVO antes de desvincular.
    await verifyTotpCode(proofFactorId.value, proofCode.value)
    // Verifica novamente AAL2, identidade e propriedade no servidor.
    await removeVerifiedTotpFactor(id)
    removalId.value = null
    confirmation.value = ''
    await signOutAndReturnToLogin()
  } catch (error) { errorText.value = safeError(error) }
  finally { busy.value = false }
}
</script>

<template>
  <section class="totp-settings" aria-labelledby="totp-title">
    <h2 id="totp-title">{{ setupOnly ? 'Configurar autenticador' : 'Segurança · Gerenciar autenticadores' }}</h2>
    <p>Gerencie seus dispositivos de autenticação em duas etapas com confirmação pelo Supabase.</p>

    <p v-if="loading" class="auth-muted" role="status">Consultando autenticadores...</p>
    <template v-else>
      <p v-if="verifiedCount > 0" class="success" role="status">
        Proteção ativada: {{ verifiedCount }} autenticador{{ verifiedCount > 1 ? 'es' : '' }} cadastrado{{ verifiedCount > 1 ? 's' : '' }}.
        <span v-if="assurance === 'aal2'"> Sua sessão foi verificada com 2FA.</span>
      </p>
      <p v-else class="auth-muted">Nenhum autenticador verificado no Supabase. Configure um antes de usar o Farol.</p>

      <template v-if="!setupOnly && verifiedCount > 0">
        <p v-if="!canManage" class="auth-warning" role="status">
          Para adicionar, substituir ou remover dispositivos, entre novamente e valide o autenticador atual.
        </p>
        <div class="factor-list">
          <div v-for="(factor, index) in factors" :key="factor.id" class="factor-entry">
            <div class="factor-identity">
              <strong>{{ factorName(factor, index) }}</strong>
              <small>Aplicativo autenticador · Vinculado ao Supabase</small>
            </div>
            <div v-if="canManage && !pending && !removalId && !replacementRequestId" class="factor-actions">
              <button type="button" class="secondary-action" :disabled="busy" @click="requestReplacement(factor.id)">
                Substituir
              </button>
              <button type="button" class="secondary-action factor-danger" :disabled="busy" @click="chooseRemoval(factor.id)">
                Remover
              </button>
            </div>
          </div>
        </div>
        <form v-if="replacementRequestId" class="factor-remove-form" @submit.prevent="authorizeReplacement">
          <strong>Confirmar autenticador atual antes de substituir</strong>
          <p>Informe um código válido de um dos autenticadores já cadastrados. Só após verificar esse código você poderá cadastrar o novo dispositivo.</p>
          <label>Autenticador existente
            <select v-model="proofFactorId" :disabled="busy">
              <option v-for="(factor, index) in factors" :key="factor.id" :value="factor.id">{{ factorName(factor, index) }}</option>
            </select>
          </label>
          <label>Código atual de seis dígitos
            <input v-model.trim="proofCode" type="text" inputmode="numeric" autocomplete="one-time-code"
              pattern="[0-9]{6}" minlength="6" maxlength="6" required :disabled="busy" placeholder="000000" />
          </label>
          <div class="factor-actions">
            <button type="submit" class="primary" :disabled="busy || !/^[0-9]{6}$/.test(proofCode)">Verificar e continuar</button>
            <button type="button" class="secondary-action" :disabled="busy" @click="replacementRequestId = null; proofCode = ''">Cancelar</button>
          </div>
        </form>
        <form v-if="removalId" class="factor-remove-form" @submit.prevent="confirmRemoval">
          <strong>Confirmar remoção de autenticador</strong>
          <p v-if="verifiedCount === 1">
            Este é seu último autenticador. Depois da remoção, você sairá da conta e precisará cadastrar outro após inserir a senha. Os dados financeiros permanecerão bloqueados até o novo 2FA ser ativado.
          </p>
          <p v-else>
            O dispositivo escolhido será desvinculado. Você sairá da conta e poderá entrar novamente com um dos autenticadores restantes.
          </p>
          <label>Autenticador usado para confirmar sua identidade
            <select v-model="proofFactorId" :disabled="busy">
              <option v-for="(factor, index) in factors" :key="factor.id" :value="factor.id">{{ factorName(factor, index) }}</option>
            </select>
          </label>
          <label>Código atual de seis dígitos
            <input v-model.trim="proofCode" type="text" inputmode="numeric" autocomplete="one-time-code"
              pattern="[0-9]{6}" minlength="6" maxlength="6" required :disabled="busy" placeholder="000000" />
          </label>
          <label>Para confirmar, digite <strong>REMOVER</strong>
            <input v-model="confirmation" type="text" autocomplete="off" maxlength="7" :disabled="busy" placeholder="REMOVER" required />
          </label>
          <div class="factor-actions">
            <button type="submit" class="secondary-action factor-danger" :disabled="busy || confirmation !== 'REMOVER' || !/^[0-9]{6}$/.test(proofCode)">
              {{ busy ? 'Removendo...' : 'Confirmar remoção' }}
            </button>
            <button type="button" class="secondary-action" :disabled="busy" @click="removalId = null; confirmation = ''; proofCode = ''">
              Cancelar
            </button>
          </div>
        </form>
      </template>

      <div v-if="pending" class="totp-enrollment">
        <p v-if="replacementId"><strong>Substituição:</strong> o autenticador antigo só será removido depois que o novo for confirmado.</p>
        <p><strong>1.</strong> Abra o aplicativo autenticador no celular e escaneie este QR Code.</p>
        <img v-if="qrImage && !qrDisplayFailed" class="totp-qr" :src="qrImage"
          alt="QR Code para cadastrar o Farol no aplicativo autenticador"
          @error="qrDisplayFailed = true" />
        <p v-if="!qrImage || qrDisplayFailed" class="auth-muted" role="status">
          A imagem não pôde ser exibida. Use a chave manual abaixo.
        </p>
        <button type="button" class="auth-inline-link" :disabled="busy" @click="showSecret = !showSecret">
          {{ showSecret ? 'Ocultar chave manual' : 'Não consigo escanear: mostrar chave manual' }}
        </button>
        <p v-if="showSecret" class="totp-secret">{{ pending.secret }}</p>
        <p><strong>2.</strong> Digite o código de seis dígitos gerado pelo autenticador.</p>
        <form class="auth-form" @submit.prevent="confirmEnrollment">
          <label>Código do novo autenticador
            <input v-model.trim="code" type="text" inputmode="numeric" autocomplete="one-time-code"
              pattern="[0-9]{6}" maxlength="6" minlength="6" required :disabled="busy"
              placeholder="000000" aria-label="Código de seis dígitos" />
          </label>
          <button type="submit" class="primary auth-full-button" :disabled="busy">
            {{ busy ? 'Verificando...' : replacementId ? 'Confirmar e substituir' : 'Confirmar e ativar' }}
          </button>
        </form>
        <button type="button" class="secondary-action auth-full-button" :disabled="busy" @click="cancelEnrollment">
          Cancelar cadastro
        </button>
      </div>
      <button v-else-if="!removalId && !replacementRequestId && (verifiedCount === 0 || canManage)" type="button"
        class="primary auth-full-button" :disabled="busy" @click="beginEnrollment()">
        {{ verifiedCount ? 'Adicionar outro autenticador' : 'Ativar autenticador' }}
      </button>
    </template>

    <p v-if="message" class="success" role="status">{{ message }}</p>
    <p v-if="errorText" class="error" role="alert">{{ errorText }}</p>
    <div v-if="!setupOnly" class="factor-recovery">
      <strong>Perdeu todos os dispositivos?</strong>
      <p>Excluir uma conta do aplicativo no celular não remove seu vínculo no Supabase. Se ainda houver um fator verificado, não é seguro substituí-lo apenas com a senha ou um e-mail.</p>
      <p>Primeiro tente restaurar o backup ou utilizar outro autenticador previamente vinculado. Se não houver nenhum, a recuperação exige verificação de identidade pelo responsável pela aplicação. O Farol não faz remoção automática de fatores perdidos.</p>
      <p>Recomendamos manter dois autenticadores verificados para não perder o acesso.</p>
    </div>
    <small class="auth-muted">
      O Supabase não disponibiliza códigos de recuperação TOTP. Não compartilhe o QR Code, a chave manual ou os códigos de seis dígitos.
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
.factor-list { display: grid; gap: .65rem; margin: .8rem 0; }
.factor-entry { display: flex; align-items: center; justify-content: space-between; gap: .75rem; flex-wrap: wrap; border: 1px solid var(--border-color, #8885); border-radius: 10px; padding: .8rem; }
.factor-identity { display: grid; gap: .2rem; overflow-wrap: anywhere; }
.factor-identity small { opacity: .75; }
.factor-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
.factor-actions button { padding: .55rem .8rem; }
.factor-danger { color: #b42332; border-color: #b42332; }
.factor-remove-form { display: grid; gap: .75rem; padding: 1rem; border: 1px solid #b42332; border-radius: 10px; }
.factor-remove-form label { display: grid; gap: .4rem; }
.factor-remove-form input { width: 100%; }
.factor-recovery { margin: 1rem 0; padding: .8rem; border: 1px solid var(--border-color, #8885); border-radius: 10px; }
</style>
