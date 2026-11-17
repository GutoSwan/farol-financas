<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../../infrastructure/auth/supabase'
import { useAuth } from '../composables/useAuth'
import { useTheme } from '../composables/useTheme'
import { PROFILE_ICONS } from '../../domain/profile/profile'
import { RecoveryEmailRateLimitError } from '../../domain/auth/recoveryEmailRateLimit'
import { MIN_NEW_PASSWORD_LENGTH } from '../../domain/auth/passwordSafety'
import type { ProfileIcon } from '../../domain/profile/profile'
import BackNavigation from '../components/BackNavigation.vue'
import UiIcon from '../components/UiIcon.vue'

type AuthMode = 'login' | 'forgot' | 'reset' | 'profile' | 'confirmed'
const props = defineProps<{ mode: AuthMode }>()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()
const {
  configured, ready, user, profile, isLoggedIn, recoveringPassword, passwordJustChanged,
  signIn, signOut, updateProfile, requestPasswordReset, recoverFromEmailLink, updatePassword,
} = useAuth()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const recoveryLinkInput = ref('')
const passwordResetDone = ref(false)
const recoveryEmailRateLimited = ref(false)
const busy = ref(false)
const message = ref('')
const errorText = ref('')
const confirmationStatus = ref<'checking' | 'confirmed' | 'unverified'>('checking')
const editingProfile = ref(false)
const editedName = ref('')
const editedIcon = ref<ProfileIcon>('user')

watch(() => props.mode, () => {
  password.value = ''
  confirmPassword.value = ''
  recoveryLinkInput.value = ''
  passwordResetDone.value = false
  recoveryEmailRateLimited.value = false
  message.value = ''
  errorText.value = ''
  editingProfile.value = false
})
watch([() => props.mode, ready, user], async ([mode, loaded]) => {
  if (mode !== 'confirmed' || !loaded || !supabase) return
  try {
    const { data, error } = await supabase.auth.getUser()
    confirmationStatus.value = !error && data.user?.email_confirmed_at ? 'confirmed' : 'unverified'
  } catch {
    confirmationStatus.value = 'unverified'
  }
}, { immediate: true })

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.'
}
function clearMessages(): void { message.value = ''; errorText.value = '' }

async function submit(): Promise<void> {
  if (busy.value || !configured || (props.mode === 'forgot' && recoveryEmailRateLimited.value)) return
  clearMessages()
  if (props.mode === 'reset' && (password.value !== confirmPassword.value || Array.from(password.value).length < MIN_NEW_PASSWORD_LENGTH)) {
    errorText.value = `A senha deve ter pelo menos ${MIN_NEW_PASSWORD_LENGTH} caracteres e ser igual nos dois campos.`
    return
  }
  busy.value = true
  try {
    if (props.mode === 'login') {
      await signIn(email.value, password.value)
      password.value = ''
      await router.replace('/')
    } else if (props.mode === 'forgot') {
      await requestPasswordReset(email.value)
      message.value = 'Se a conta existir, você receberá um link para definir uma nova senha. Confira também o spam.'
    } else if (props.mode === 'reset') {
      await updatePassword(password.value)
      password.value = ''
      confirmPassword.value = ''
      passwordResetDone.value = true
      message.value = 'Senha alterada. Entre novamente com seu e-mail e a nova senha.'
    }
  } catch (cause) {
    if (props.mode === 'forgot' && cause instanceof RecoveryEmailRateLimitError) recoveryEmailRateLimited.value = true
    errorText.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

async function confirmRecoveryLink(): Promise<void> {
  if (busy.value || !configured) return
  busy.value = true
  clearMessages()
  try {
    await recoverFromEmailLink(recoveryLinkInput.value)
    message.value = 'Link confirmado. Você já pode definir uma nova senha.'
  } catch (cause) {
    errorText.value = errorMessage(cause)
  } finally {
    // O link contém um token de uso único; não o manter em estado após a verificação.
    recoveryLinkInput.value = ''
    busy.value = false
  }
}

function startProfileEdit(): void {
  editedName.value = profile.value.displayName
  editedIcon.value = profile.value.avatarIcon
  editingProfile.value = true
  clearMessages()
}

async function saveProfile(): Promise<void> {
  if (busy.value) return
  busy.value = true
  clearMessages()
  try {
    await updateProfile(editedName.value, editedIcon.value)
    editingProfile.value = false
    message.value = 'Perfil atualizado.'
  } catch (cause) {
    errorText.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

async function logout(): Promise<void> {
  if (busy.value) return
  busy.value = true
  clearMessages()
  try {
    await signOut()
    await router.replace('/entrar')
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
      <BackNavigation v-if="mode !== 'login'" :fallback="mode === 'profile' ? '/' : '/entrar'" />
      <RouterLink class="auth-brand" to="/">◈ Farol <span>Finanças</span></RouterLink>
      <button class="auth-theme-button" type="button"
        :aria-label="isDark ? 'Ativar tema claro' : 'Ativar tema escuro'"
        @click="toggleTheme"><UiIcon :name="isDark ? 'sun' : 'moon'" :size="19" /></button>
      <p class="auth-kicker">NOSSO CONTROLE FINANCEIRO</p>

      <div v-if="!configured" class="auth-warning" role="alert">
        A conexão com o Supabase ainda não foi configurada nesta versão.
      </div>

      <template v-if="mode === 'profile'">
        <h1>Meu perfil</h1>
        <p class="auth-subtitle">Ajuste seu nome e ícone. As finanças da família ficam em uma área separada.</p>
        <p v-if="!ready" class="auth-muted">Verificando sua sessão...</p>
        <template v-else-if="isLoggedIn">
          <div class="auth-identity">
            <span class="auth-avatar-preview"><UiIcon :name="profile.avatarIcon" :size="27" /></span>
            <div><strong>{{ profile.displayName }}</strong><small>{{ user?.email }}</small></div>
          </div>
          <form v-if="editingProfile" class="auth-form profile-edit-form" @submit.prevent="saveProfile">
            <label>Nome de exibição
              <input v-model="editedName" required minlength="2" maxlength="40" autocomplete="nickname" :disabled="busy" />
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
            <button class="primary auth-full-button" type="submit" :disabled="busy">Salvar perfil</button>
            <button class="secondary-action auth-full-button" type="button" @click="editingProfile = false">Cancelar</button>
          </form>
          <button v-else class="primary auth-full-button" type="button" @click="startProfileEdit">
            <UiIcon name="edit" :size="17" /> Editar nome e ícone
          </button>
          <nav class="profile-quick-links" aria-label="Opções da conta">
            <RouterLink to="/recuperar-senha"><UiIcon name="shield-check" :size="17" /> Alterar senha por e-mail</RouterLink>
            <RouterLink to="/dados-online"><UiIcon name="folder" :size="17" /> Dados da família na nuvem</RouterLink>
            <RouterLink to="/backup-financeiro"><UiIcon name="folder" :size="17" /> Backup dos dados antigos</RouterLink>
          </nav>
          <button class="secondary-action auth-full-button" type="button" :disabled="busy" @click="logout">
            <UiIcon name="log-out" :size="16" /> Sair da conta
          </button>
        </template>
        <RouterLink v-else to="/entrar" class="primary auth-full-button">Entrar no Farol</RouterLink>
      </template>

      <template v-else-if="mode === 'confirmed'">
        <div class="auth-confirmed" role="status">
          <h1>{{ confirmationStatus === 'confirmed' ? 'E-mail confirmado!' : confirmationStatus === 'checking' ? 'Verificando e-mail...' : 'Não foi possível confirmar' }}</h1>
          <p>{{ confirmationStatus === 'confirmed' ? 'Seu endereço foi confirmado. Entre para continuar.' : 'Se você abriu o link em outro dispositivo, volte ao login com seu e-mail e senha.' }}</p>
          <RouterLink class="primary auth-full-button" to="/entrar">Ir para o login</RouterLink>
        </div>
      </template>

      <template v-else>
        <h1>{{ mode === 'login' ? 'Entrar no Farol' : mode === 'forgot' ? 'Recuperar senha' : 'Definir nova senha' }}</h1>
        <p class="auth-subtitle">{{ mode === 'login' ? 'Acesso reservado às duas contas da família.' : mode === 'forgot' ? 'Enviaremos um link para o e-mail da sua conta.' : 'Escolha uma nova senha para entrar no Farol.' }}</p>
        <p v-if="mode === 'login' && passwordJustChanged" class="success" role="status">Sua senha foi atualizada.</p>

        <section v-if="mode === 'reset' && !recoveringPassword && !passwordResetDone" class="auth-warning">
          <strong>Confirme seu link de recuperação</strong>
          <p>Abra o link do e-mail. Caso ele não abra esta página, copie o endereço completo e cole abaixo. Nunca compartilhe o link com ninguém.</p>
          <form class="auth-form" @submit.prevent="confirmRecoveryLink">
            <label>Link recebido por e-mail
              <textarea v-model.trim="recoveryLinkInput" rows="3" autocomplete="off" spellcheck="false"
                maxlength="4096" required :disabled="busy" placeholder="https://...supabase.co/auth/v1/verify?token=..." />
            </label>
            <button class="secondary-action auth-full-button" type="submit" :disabled="busy || !recoveryLinkInput">Confirmar link</button>
          </form>
          <RouterLink to="/recuperar-senha">Pedir outro link</RouterLink>
        </section>
        <div v-if="mode === 'reset' && passwordResetDone" class="auth-confirmed" role="status">
          <h2>Senha atualizada</h2>
          <RouterLink class="primary auth-full-button" to="/entrar">Entrar novamente</RouterLink>
        </div>

        <form v-if="mode !== 'reset' || (recoveringPassword && !passwordResetDone)"
          class="auth-form" @submit.prevent="submit">
          <p v-if="mode === 'reset'" class="auth-muted">Use pelo menos {{ MIN_NEW_PASSWORD_LENGTH }} caracteres. Antes de salvar, verificamos gratuitamente se a senha já apareceu em vazamentos, sem enviá-la completa.</p>
          <label v-if="mode !== 'reset'">E-mail
            <input v-model.trim="email" type="email" autocomplete="email" maxlength="254" required :disabled="busy || !configured" />
          </label>
          <label v-if="mode !== 'forgot'">Senha {{ mode === 'reset' ? 'nova' : '' }}
            <span class="auth-password-row">
              <input v-model="password" :type="showPassword ? 'text' : 'password'"
                :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
                :minlength="mode === 'login' ? 1 : MIN_NEW_PASSWORD_LENGTH" required :disabled="busy || !configured" />
              <button class="auth-password-toggle" type="button" @click="showPassword = !showPassword">
                {{ showPassword ? 'Ocultar' : 'Mostrar' }}
              </button>
            </span>
          </label>
          <label v-if="mode === 'reset'">Confirmar nova senha
            <input v-model="confirmPassword" :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password" :minlength="MIN_NEW_PASSWORD_LENGTH" required :disabled="busy || !configured" />
          </label>
          <button class="primary auth-full-button" type="submit"
            :disabled="busy || !configured || (mode === 'forgot' && recoveryEmailRateLimited)">
            {{ busy ? 'Aguarde...' : mode === 'login' ? 'Entrar' : mode === 'forgot' ? 'Enviar link de recuperação' : 'Salvar nova senha' }}
          </button>
        </form>
        <p v-if="recoveryEmailRateLimited" class="auth-muted" role="status">O envio de e-mails atingiu um limite temporário. Aguarde para tentar novamente.</p>
        <div class="auth-links">
          <RouterLink v-if="mode !== 'login'" to="/entrar">Voltar ao login</RouterLink>
          <RouterLink v-if="mode === 'login'" to="/recuperar-senha">Esqueci minha senha</RouterLink>
        </div>
      </template>
      <p v-if="message" class="success" role="status">{{ message }}</p>
      <p v-if="errorText" class="error" role="alert">{{ errorText }}</p>
      <div class="auth-footer">
        <small>Uso familiar privado. Os dados financeiros antigos deste navegador não serão apagados ao sair.</small>
      </div>
    </div>
  </div>
</template>
