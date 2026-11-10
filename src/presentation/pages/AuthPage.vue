<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import UiIcon from '../components/UiIcon.vue'
import BackNavigation from '../components/BackNavigation.vue'
import { useTheme } from '../composables/useTheme'
import { phoneAuthEnabled } from '../../infrastructure/auth/phoneAuth'
import { useAuth } from '../composables/useAuth'
import { PROFILE_ICONS } from '../../domain/profile/profile'
import type { ProfileIcon } from '../../domain/profile/profile'

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset' | 'profile'
type SignupStep = 'form' | 'verification' | 'success'
const props = defineProps<{ mode: AuthMode }>()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()
const {
  configured, ready, user, profile, isLoggedIn, isSuperAdmin, signIn, signUp, verifySignupCode, resendSignupCode,
  updateProfile, signOut, requestPasswordReset, recoverFromEmailLink, recoveringPassword,
  recoveryMfaChecked, recoveryMfaRequired, recoveryMfaVerified, recoveryTotpFactors,
  prepareRecoveryMfa, verifyRecoveryMfa, updatePassword,
} = useAuth()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const recoveryLinkInput = ref('')
const passwordResetDone = ref(false)
const recoveryMfaCode = ref('')
const recoveryMfaFactorId = ref('')
const displayName = ref('')
const showPassword = ref(false)
const busy = ref(false)
const message = ref('')
const errorText = ref('')
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
  recoveryLinkInput.value = ''
  passwordResetDone.value = false
  recoveryMfaCode.value = ''
  recoveryMfaFactorId.value = ''
  code.value = ''
  signupStep.value = 'form'
  message.value = ''
  errorText.value = ''
  editingProfile.value = false
})
// O link recuperado inicia AAL1. Nunca mostrar o formulário de senha antes
// de verificar os fatores atuais e, se houver TOTP, elevar a sessão para AAL2.
watch([recoveringPassword, () => props.mode], async ([active, mode]) => {
  if (!active || mode !== 'reset') return
  await loadRecoveryMfa()
}, { immediate: true })

async function loadRecoveryMfa(): Promise<void> {
  if (busy.value) return
  resetMessages()
  busy.value = true
  try {
    await prepareRecoveryMfa()
    recoveryMfaFactorId.value = recoveryTotpFactors.value[0]?.id ?? ''
    if (recoveryMfaRequired.value && !recoveryMfaVerified.value) {
      message.value = 'Link confirmado. Informe o código do Authenticator para autorizar a nova senha.'
    }
  } catch (cause) {
    errorText.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

async function confirmRecoveryTotp(): Promise<void> {
  if (busy.value || !recoveryMfaFactorId.value) return
  resetMessages()
  busy.value = true
  try {
    await verifyRecoveryMfa(recoveryMfaFactorId.value, recoveryMfaCode.value)
    recoveryMfaCode.value = ''
    message.value = 'Authenticator confirmado! Agora você pode definir a nova senha.'
  } catch (cause) {
    errorText.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

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
      // Após autenticar, abrir a Visão geral. O perfil continua no menu lateral.
      await router.replace('/')
    } else if (props.mode === 'signup') {
      const hasSession = await signUp(email.value, password.value, displayName.value)
      password.value = ''
      confirmPassword.value = ''
      verificationEmail.value = email.value.trim()
      signupStep.value = hasSession ? 'success' : 'verification'
      if (hasSession) message.value = 'Cadastro realizado! Sua conta já está confirmada.'
      else message.value = 'Se este e-mail puder ser cadastrado, enviaremos instruções de confirmação. Se já tiver uma conta, entre normalmente ou recupere sua senha.'
    } else if (props.mode === 'forgot') {
      await requestPasswordReset(email.value)
      message.value = 'Se o e-mail estiver cadastrado no Supabase Dev, você receberá um link. Abra o link para definir a senha; se for redirecionado para outro site, copie o link original do e-mail e cole na página Definir nova senha do Farol.'
    } else if (props.mode === 'reset') {
      await updatePassword(password.value)
      password.value = ''
      confirmPassword.value = ''
      passwordResetDone.value = true
      message.value = 'Senha atualizada! Entre novamente e confirme seu autenticador para abrir o Farol.'
    }
  } catch (cause) {
    const reason = errorMessage(cause)
    errorText.value = props.mode === 'login' && /invalid login credentials|invalid email or password/i.test(reason)
      ? 'E-mail ou senha não reconhecidos neste ambiente. O Supabase Dev possui uma senha independente da versão principal do Farol. Use “Esqueci minha senha” para definir a senha do Dev.'
      : reason
  } finally {
    busy.value = false
  }
}

async function confirmRecoveryLink(): Promise<void> {
  if (busy.value || !configured) return
  resetMessages()
  busy.value = true
  try {
    await recoverFromEmailLink(recoveryLinkInput.value)
    // O watcher pode executar enquanto busy=true. Preparar aqui garante que
    // a confirmação manual do link também mostre o desafio sem clique extra.
    await prepareRecoveryMfa()
    recoveryMfaFactorId.value = recoveryTotpFactors.value[0]?.id ?? ''
    message.value = recoveryMfaRequired.value && !recoveryMfaVerified.value
      ? 'Link confirmado. Informe o código do Authenticator para continuar.'
      : 'Link confirmado. Agora você pode definir sua nova senha.'
  } catch (cause) {
    errorText.value = errorMessage(cause)
  } finally {
    // O endereço de recuperação contém um token de uso único:
    // nunca deixá-lo salvo no campo, em histórico, analytics ou logs.
    recoveryLinkInput.value = ''
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
    message.value = 'Reenvio solicitado. Confira a caixa de entrada e o spam. O Supabase pode enviar outro link em vez de código; se o e-mail já foi confirmado, entre pelo login.'
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

</script>

<template>
  <div class="auth-screen">
    <div class="auth-card">
      <BackNavigation v-if="mode !== 'login'" :fallback="mode === 'profile' ? '/' : '/entrar'" />
      <RouterLink class="auth-brand" to="/">◈ Farol <span>Finanças</span></RouterLink>
      <button type="button" class="auth-theme-button" :aria-label="isDark ? 'Ativar tema claro' : 'Ativar tema escuro'" :title="isDark ? 'Ativar tema claro' : 'Ativar tema escuro'" @click="toggleTheme">
        <UiIcon :name="isDark ? 'sun' : 'moon'" :size="19" />
      </button>
      <p class="auth-kicker">SUA VIDA FINANCEIRA MAIS CLARA</p>

      <div v-if="!configured" class="auth-warning" role="alert">
        <UiIcon name="info" :size="20" />
        <div><strong>Conexão com Supabase ainda não configurada</strong>
          <p>No Preview da Vercel, configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> nas variáveis de ambiente do projeto frontend. Depois crie um novo deployment.</p>
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

          <nav class="profile-quick-links" aria-label="Opções da minha conta">
            <RouterLink to="/seguranca"><UiIcon name="settings" :size="17" /> Segurança e autenticadores</RouterLink>
            <RouterLink to="/dados-online"><UiIcon name="folder" :size="17" /> Meus dados na nuvem</RouterLink>
            <RouterLink v-if="isSuperAdmin" to="/administracao">
              <UiIcon name="archive" :size="17" /> Ferramentas de administração
            </RouterLink>
          </nav>
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
        <h1>Verifique seu e-mail</h1>
        <p class="auth-subtitle">Enviamos uma mensagem de confirmação para <strong>{{ verificationEmail }}</strong>. Caso ela tenha um código numérico, digite-o abaixo. Se tiver o botão <strong>Confirm address</strong>, use o link e depois volte ao login. Não compartilhe o link nem o código.</p>
        <form class="auth-form" @submit.prevent="confirmEmail">
          <label>E-mail que recebeu o código
            <input v-model.trim="verificationEmail" type="email" autocomplete="email"
              required maxlength="254" :disabled="busy" placeholder="voce@exemplo.com" />
          </label>
          <label>Código recebido por e-mail
            <input v-model.trim="code" type="text" inputmode="numeric" autocomplete="one-time-code"
              pattern="[0-9]{6,8}" minlength="6" maxlength="8" required
              :disabled="busy" class="auth-otp-input" placeholder="Ex.: 123456" />
          </label>
          <button type="submit" class="primary auth-full-button" :disabled="busy">
            <UiIcon name="check" :size="18" /> {{ busy ? 'Conferindo...' : 'Confirmar e-mail' }}
          </button>
        </form>
        <button type="button" class="auth-inline-link" :disabled="busy" @click="resendCode">Reenviar e-mail de confirmação</button>
        <RouterLink class="auth-inline-link" to="/entrar">Já tenho cadastro ou confirmei pelo link. Ir para o login</RouterLink>
        <RouterLink class="auth-inline-link" to="/recuperar-senha">Este e-mail já era meu. Recuperar senha</RouterLink>
        <button type="button" class="auth-inline-link" :disabled="busy" @click="signupStep = 'form'; code = ''; resetMessages()">
          Corrigir e-mail ou voltar ao cadastro
        </button>
        <p class="auth-muted">O reenvio pode não gerar um novo e-mail se o endereço já estiver confirmado ou se houver um limite temporário de envio. Ao abrir o link pelo Gmail do celular, a sessão do navegador do computador não é transferida: você pode voltar ao computador e entrar normalmente.</p>
      </template>

      <template v-else>
        <h1>{{ mode === 'login' ? 'Entrar no Farol' : mode === 'signup' ? 'Criar uma conta' : mode === 'forgot' ? 'Recuperar minha senha' : 'Definir nova senha' }}</h1>
        <div v-if="mode === 'login' || mode === 'signup' || mode === 'forgot'" class="auth-method-choice" aria-label="Escolha seu método de acesso">
          <span class="auth-method-active"><UiIcon name="mail" :size="16" /> E-mail</span>
          <RouterLink :to="mode === 'login' ? '/entrar/celular' : mode === 'signup' ? '/cadastro/celular' : '/recuperar-celular'">
            <UiIcon name="smartphone" :size="16" /> Celular <small v-if="!phoneAuthEnabled">Em preparação</small>
          </RouterLink>
        </div>
        <p class="auth-subtitle">{{ mode === 'login' ? 'Acesse com seu e-mail e sua senha.' : mode === 'signup' ? 'Crie seu acesso. Enviaremos um código de confirmação por e-mail.' : mode === 'forgot' ? 'Enviaremos um link de recuperação para seu e-mail.' : 'Digite a nova senha para sua conta.' }}</p>
        <p v-if="mode === 'login'" class="auth-muted">Esta Preview usa o Supabase Dev. A senha da sua conta na versão principal pode não funcionar aqui.</p>

        <section v-if="mode === 'reset' && !recoveringPassword && !passwordResetDone" class="auth-warning" aria-label="Confirmar link de recuperação">
          <div>
            <strong>Confirme o link para trocar a senha</strong>
            <p>Se o link do e-mail não abriu esta tela corretamente, solicite outro e-mail e use “Copiar endereço do link”. Cole abaixo o endereço original do Supabase Dev, sem enviá-lo a ninguém.</p>
            <form class="auth-form" @submit.prevent="confirmRecoveryLink">
              <label>Link de recuperação do e-mail
                <textarea v-model.trim="recoveryLinkInput" rows="3" autocomplete="off" spellcheck="false"
                  :disabled="busy" maxlength="4096" required placeholder="https://...supabase.co/auth/v1/verify?token=..." />
              </label>
              <button type="submit" class="secondary-action auth-full-button" :disabled="busy || !recoveryLinkInput.trim()">
                {{ busy ? 'Verificando...' : 'Confirmar link de recuperação' }}
              </button>
            </form>
            <RouterLink class="auth-inline-link" to="/recuperar-senha">Pedir outro link de recuperação</RouterLink>
          </div>
        </section>
        <div v-if="mode === 'reset' && recoveringPassword && !recoveryMfaChecked" class="auth-info" role="status">
          Conferindo o nível de segurança da sessão de recuperação...
          <button type="button" class="auth-inline-link" :disabled="busy" @click="loadRecoveryMfa">
            Verificar autenticador novamente
          </button>
        </div>
        <section v-if="mode === 'reset' && recoveringPassword && recoveryMfaChecked && recoveryMfaRequired && !recoveryMfaVerified"
          class="auth-warning" aria-label="Confirmar autenticador para recuperar senha">
          <div>
            <strong>Confirme sua identidade com o Authenticator</strong>
            <p>O link por e-mail foi aceito. Para alterar a senha de uma conta com 2FA, o Supabase exige uma sessão AAL2.</p>
            <form class="auth-form" @submit.prevent="confirmRecoveryTotp">
              <label v-if="recoveryTotpFactors.length > 1">Selecione o autenticador
                <select v-model="recoveryMfaFactorId" :disabled="busy">
                  <option v-for="factor in recoveryTotpFactors" :key="factor.id" :value="factor.id">{{ factor.label }}</option>
                </select>
              </label>
              <label>Código de seis dígitos do aplicativo autenticador
                <input v-model.trim="recoveryMfaCode" type="text" inputmode="numeric" autocomplete="one-time-code"
                  pattern="[0-9]{6}" minlength="6" maxlength="6" required :disabled="busy"
                  placeholder="000000" class="auth-otp-input" />
              </label>
              <button type="submit" class="primary auth-full-button" :disabled="busy || !recoveryMfaFactorId">
                {{ busy ? 'Verificando...' : 'Confirmar autenticador' }}
              </button>
            </form>
          </div>
        </section>
        <div v-if="mode === 'reset' && recoveringPassword && recoveryMfaVerified && !passwordResetDone"
          class="auth-info" role="status">
          Identidade confirmada. Agora escolha sua nova senha do Supabase Dev.
        </div>
        <div v-if="mode === 'reset' && passwordResetDone" class="auth-confirmed" role="status">
          <h2>Senha alterada com sucesso</h2>
          <p>Entre com a nova senha e confirme seu aplicativo autenticador.</p>
          <RouterLink class="primary auth-full-button" to="/entrar">Ir para o login</RouterLink>
        </div>
        <div v-if="isLoggedIn && mode !== 'reset'" class="auth-info">Você já está autenticado. <RouterLink to="/conta">Ver meu perfil</RouterLink>.</div>

        <form v-if="mode !== 'reset' || (recoveringPassword && recoveryMfaChecked && recoveryMfaVerified && !passwordResetDone)"
          class="auth-form" @submit.prevent="submit">
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
        <p v-if="mode === 'signup'" class="auth-account-hint">
          Já usou este e-mail no Farol? Por segurança não verificamos publicamente se um endereço tem cadastro.
          <RouterLink to="/entrar">Entrar</RouterLink> ou <RouterLink to="/recuperar-senha">recuperar acesso</RouterLink>.
        </p>
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
        <small>Para acessar as finanças, entre na sua conta. Os dados já salvos neste dispositivo não são apagados ao sair e ainda não são separados por usuário.</small>
      </div>
    </div>
  </div>
</template>
