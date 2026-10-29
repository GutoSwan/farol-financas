<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import UiIcon from '../components/UiIcon.vue'
import { useAuth } from '../composables/useAuth'
import { PROFILE_ICONS } from '../../domain/profile/profile'
import type { ProfileIcon } from '../../domain/profile/profile'

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset' | 'profile'
type SignupStep = 'form' | 'verification' | 'success'
const props = defineProps<{ mode: AuthMode }>()
const router = useRouter()
const {
  configured, ready, user, profile, isLoggedIn, signIn, signUp, verifySignupCode, resendSignupCode,
  updateProfile, signOut, requestPasswordReset, updatePassword, checkApiAuth,
} = useAuth()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const displayName = ref('')
const showPassword = ref(false)
const busy = ref(false)
const message = ref('')
const errorText = ref('')
const workspaceCount = ref<number | null>(null)
const signupStep = ref<SignupStep>('form')
const verificationEmail = ref('')
const code = ref('')
const nextResendAt = ref(0)
const editingProfile = ref(false)
const editedName = ref('')
const editedIcon = ref<ProfileIcon>('user')

watch(() => props.mode, () => {
  password.value = ''
  confirmPassword.value = ''
  code.value = ''
  signupStep.value = 'form'
  message.value = ''
  errorText.value = ''
  workspaceCount.value = null
  editingProfile.value = false
})
watch(profile, (current) => {
  if (!editingProfile.value) {
    editedName.value = current.displayName
    editedIcon.value = current.avatarIcon
  }
}, { immediate: true })

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.'
}

function resetMessages(): void {
  message.value = ''
  errorText.value = ''
}

async function submit(): Promise<void> {
  if (busy.value || !configured) return
  resetMessages()
  if ((props.mode === 'signup' || props.mode === 'reset') && password.value !== confirmPassword.value) {
    errorText.value = 'As senhas informadas não são iguais.'
    return
  }
  if ((props.mode === 'signup' || props.mode === 'reset') && password.value.length < 8) {
    errorText.value = 'Escolha uma senha com pelo menos 8 caracteres.'
    return
  }
  busy.value = true
  try {
    if (props.mode === 'login') {
      await signIn(email.value, password.value)
      password.value = ''
      await router.replace('/conta')
    } else if (props.mode === 'signup') {
      const hasSession = await signUp(email.value, password.value, displayName.value)
      password.value = ''
      confirmPassword.value = ''
      verificationEmail.value = email.value.trim()
      signupStep.value = hasSession ? 'success' : 'verification'
      if (hasSession) message.value = 'Cadastro realizado! Sua conta já está confirmada.'
      else message.value = 'Enviamos um código para seu e-mail. Digite-o aqui para confirmar o cadastro.'
    } else if (props.mode === 'forgot') {
      await requestPasswordReset(email.value)
      message.value = 'Se esse e-mail estiver cadastrado, enviaremos um link para redefinir a senha.'
    } else if (props.mode === 'reset') {
      await updatePassword(password.value)
      password.value = ''
      confirmPassword.value = ''
      message.value = 'Senha atualizada. Você já pode acessar o Farol com sua conta.'
    }
  } catch (cause) {
    errorText.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

async function confirmEmail(): Promise<void> {
  if (busy.value || !configured) return
  resetMessages()
  busy.value = true
  try {
    await verifySignupCode(verificationEmail.value, code.value)
    code.value = ''
    signupStep.value = 'success'
    message.value = 'Seu e-mail foi confirmado com sucesso!'
  } catch (cause) {
    errorText.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

async function resendCode(): Promise<void> {
  if (busy.value || !configured) return
  resetMessages()
  if (Date.now() < nextResendAt.value) {
    errorText.value = 'Aguarde aproximadamente 60 segundos entre os envios de código.'
    return
  }
  busy.value = true
  try {
    await resendSignupCode(verificationEmail.value)
    nextResendAt.value = Date.now() + 60_000
    message.value = 'Solicitação recebida. Verifique a caixa de entrada e o spam.'
  } catch (cause) {
    errorText.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

function startProfileEdit(): void {
  editedName.value = profile.value.displayName
  editedIcon.value = profile.value.avatarIcon
  editingProfile.value = true
  resetMessages()
}

async function saveProfile(): Promise<void> {
  if (busy.value) return
  busy.value = true
  resetMessages()
  try {
    await updateProfile(editedName.value, editedIcon.value)
    editingProfile.value = false
    message.value = 'Perfil atualizado! O novo nome e ícone aparecem no canto inferior esquerdo.'
  } catch (cause) {
    errorText.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

async function logout(): Promise<void> {
  busy.value = true
  resetMessages()
  try {
    await signOut()
    await router.replace('/entrar')
  } catch (cause) {
    errorText.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

async function testApi(): Promise<void> {
  busy.value = true
  resetMessages()
  workspaceCount.value = null
  try {
    workspaceCount.value = await checkApiAuth()
    message.value = 'Autenticação validada pela API do Farol!'
  } catch (cause) {
    errorText.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth-screen">
    <div class="auth-card">
      <RouterLink class="auth-brand" to="/">◈ Farol <span>Finanças</span></RouterLink>
      <p class="auth-kicker">SUA VIDA FINANCEIRA MAIS CLARA</p>

      <div v-if="!configured" class="auth-warning" role="alert">
        <UiIcon name="info" :size="20" />
        <div><strong>Conexão com Supabase ainda não configurada</strong>
          <p>Na raiz do frontend, crie <code>.env.local</code> com <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, depois reinicie o Vite.</p>
        </div>
      </div>

      <template v-else-if="mode === 'profile'">
        <h1>Meu perfil</h1>
        <p class="auth-subtitle">Personalize seu nome e ícone. As alterações serão salvas na sua conta Supabase.</p>
        <div v-if="!ready" class="auth-muted">Verificando sua sessão...</div>
        <template v-else-if="isLoggedIn">
          <div class="auth-identity">
            <span class="auth-avatar-preview"><UiIcon :name="profile.avatarIcon" :size="27" /></span>
            <div><strong>{{ profile.displayName }}</strong><small>{{ user?.email ?? 'Conta autenticada' }}</small></div>
          </div>

          <form v-if="editingProfile" class="auth-form profile-edit-form" @submit.prevent="saveProfile">
            <label>Nome que será exibido
              <input v-model="editedName" type="text" minlength="2" maxlength="40" autocomplete="nickname"
                required :disabled="busy" placeholder="Como podemos te chamar?" />
            </label>
            <fieldset class="profile-icon-picker">
              <legend>Escolha seu ícone</legend>
              <div class="profile-icon-grid">
                <label v-for="icon in PROFILE_ICONS" :key="icon" class="profile-icon-choice" :class="{ selected: editedIcon === icon }">
                  <input v-model="editedIcon" type="radio" name="profile-icon" :value="icon" :disabled="busy" />
                  <UiIcon :name="icon" :size="23" />
                  <span class="sr-only">{{ icon }}</span>
                </label>
              </div>
            </fieldset>
            <div class="profile-edit-actions">
              <button type="submit" class="primary" :disabled="busy">{{ busy ? 'Salvando...' : 'Salvar perfil' }}</button>
              <button type="button" class="secondary-action" :disabled="busy" @click="editingProfile = false">Cancelar</button>
            </div>
          </form>
          <button v-else type="button" class="primary auth-full-button" @click="startProfileEdit">
            <UiIcon name="edit" :size="17" /> Editar nome e ícone
          </button>

          <div class="auth-warning auth-profile-warning">
            <UiIcon name="info" :size="19" />
            <span>Seu perfil é salvo no Supabase, mas os espaços financeiros e lançamentos continuam neste navegador. O login ainda não protege nem sincroniza esses dados.</span>
          </div>
          <button type="button" class="secondary-action auth-full-button" :disabled="busy" @click="testApi">
            <UiIcon name="check" :size="16" /> {{ busy ? 'Verificando...' : 'Testar acesso à API protegida' }}
          </button>
          <p v-if="workspaceCount !== null" class="auth-muted">Espaços encontrados no banco da API: {{ workspaceCount }}. Os espaços locais são independentes.</p>
          <button type="button" class="secondary-action auth-full-button" :disabled="busy" @click="logout">
            <UiIcon name="log-out" :size="16" /> Sair da conta
          </button>
        </template>
        <div v-else>
          <p class="auth-muted">Você ainda não entrou na sua conta.</p>
          <RouterLink class="primary auth-full-button" to="/entrar">Entrar</RouterLink>
        </div>
      </template>

      <template v-else-if="mode === 'signup' && signupStep === 'success'">
        <div class="auth-confirmed">
          <span class="auth-confirmed-icon"><UiIcon name="check" :size="32" /></span>
          <h1>E-mail confirmado!</h1>
          <p>Seu cadastro foi concluído com sucesso. Agora você pode personalizar seu perfil no Farol.</p>
          <RouterLink :to="isLoggedIn ? '/conta' : '/entrar'" class="primary auth-full-button">
            {{ isLoggedIn ? 'Personalizar meu perfil' : 'Ir para o login' }}
          </RouterLink>
        </div>
      </template>

      <template v-else-if="mode === 'signup' && signupStep === 'verification'">
        <h1>Confirme seu e-mail</h1>
        <p class="auth-subtitle">Enviamos um código para <strong>{{ verificationEmail }}</strong>. Digite o código recebido aqui. Você continuará nesta página.</p>
        <form class="auth-form" @submit.prevent="confirmEmail">
          <label>Código recebido por e-mail
            <input v-model.trim="code" type="text" inputmode="numeric" autocomplete="one-time-code"
              pattern="[0-9]{6,8}" minlength="6" maxlength="8" required
              :disabled="busy" class="auth-otp-input" placeholder="Ex.: 123456" />
          </label>
          <button type="submit" class="primary auth-full-button" :disabled="busy">
            <UiIcon name="check" :size="18" /> {{ busy ? 'Conferindo...' : 'Confirmar e-mail' }}
          </button>
        </form>
        <button type="button" class="auth-inline-link" :disabled="busy" @click="resendCode">Reenviar código</button>
        <button type="button" class="auth-inline-link" :disabled="busy" @click="signupStep = 'form'; code = ''; resetMessages()">
          Corrigir e-mail ou voltar ao cadastro
        </button>
        <p class="auth-muted">Não recebeu? Confira o spam. O Supabase limita a frequência de reenvio de códigos.</p>
      </template>

      <template v-else>
        <h1>{{ mode === 'login' ? 'Entrar no Farol' : mode === 'signup' ? 'Criar uma conta' : mode === 'forgot' ? 'Recuperar minha senha' : 'Definir nova senha' }}</h1>
        <p class="auth-subtitle">{{ mode === 'login' ? 'Acesse com seu e-mail e sua senha.' : mode === 'signup' ? 'Crie seu acesso. Enviaremos um código de confirmação por e-mail.' : mode === 'forgot' ? 'Enviaremos um link de recuperação para seu e-mail.' : 'Digite a nova senha para sua conta.' }}</p>
        <div v-if="isLoggedIn && mode !== 'reset'" class="auth-info">Você já está autenticado. <RouterLink to="/conta">Ver meu perfil</RouterLink>.</div>

        <form class="auth-form" @submit.prevent="submit">
          <label v-if="mode === 'signup'">Nome de exibição
            <input v-model="displayName" type="text" required minlength="2" maxlength="40" autocomplete="nickname"
              placeholder="Ex.: Gustavo" :disabled="busy || !configured" />
          </label>
          <label v-if="mode !== 'reset'">E-mail
            <input v-model.trim="email" type="email" autocomplete="email" required
              placeholder="voce@exemplo.com" maxlength="254" :disabled="busy || !configured" />
          </label>
          <label v-if="mode === 'login' || mode === 'signup' || mode === 'reset'">Senha
            <span class="auth-password-row">
              <input v-model="password" :type="showPassword ? 'text' : 'password'" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
                required :minlength="mode === 'login' ? 1 : 8" :disabled="busy || !configured"
                :placeholder="mode === 'login' ? 'Sua senha' : 'Pelo menos 8 caracteres'" />
              <button class="auth-password-toggle" type="button" :disabled="busy" @click="showPassword = !showPassword">
                {{ showPassword ? 'Ocultar' : 'Mostrar' }}
              </button>
            </span>
          </label>
          <label v-if="mode === 'signup' || mode === 'reset'">Confirmar senha
            <input v-model="confirmPassword" :type="showPassword ? 'text' : 'password'" autocomplete="new-password"
              minlength="8" required :disabled="busy || !configured" placeholder="Repita sua senha" />
          </label>
          <button class="primary auth-full-button" type="submit" :disabled="busy || !configured">
            {{ busy ? 'Processando...' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta e receber código' : mode === 'forgot' ? 'Enviar link de recuperação' : 'Salvar nova senha' }}
          </button>
        </form>
        <button v-if="mode === 'signup'" type="button" class="auth-inline-link"
          @click="verificationEmail = email.trim(); signupStep = 'verification'; resetMessages()">
          Já tenho um código de confirmação
        </button>
        <div class="auth-links">
          <RouterLink v-if="mode !== 'login'" to="/entrar">Já tenho uma conta</RouterLink>
          <RouterLink v-if="mode === 'login'" to="/cadastro">Criar conta</RouterLink>
          <RouterLink v-if="mode === 'login'" to="/recuperar-senha">Esqueci minha senha</RouterLink>
          <RouterLink v-if="mode === 'forgot'" to="/cadastro">Ainda não tenho cadastro</RouterLink>
        </div>
      </template>

      <p v-if="message" class="success" role="status">{{ message }}</p>
      <p v-if="errorText" class="error" role="alert">{{ errorText }}</p>

      <div class="auth-footer">
        <RouterLink to="/">Voltar ao Farol (dados locais)</RouterLink>
        <small>Protótipo: entrar ou sair não apaga nem isola os dados financeiros deste navegador.</small>
      </div>
    </div>
  </div>
</template>
