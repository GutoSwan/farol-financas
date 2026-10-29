<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import UiIcon from '../components/UiIcon.vue'
import { useAuth } from '../composables/useAuth'

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset' | 'profile'
const props = defineProps<{ mode: AuthMode }>()
const router = useRouter()
const { configured, ready, user, isLoggedIn, signIn, signUp, signOut, requestPasswordReset, updatePassword, checkApiAuth } = useAuth()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const busy = ref(false)
const message = ref('')
const errorText = ref('')
const workspaceCount = ref<number | null>(null)

watch(() => props.mode, () => {
  password.value = ''
  confirmPassword.value = ''
  message.value = ''
  errorText.value = ''
  workspaceCount.value = null
})

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.'
}

async function submit(): Promise<void> {
  if (busy.value || !configured) return
  message.value = ''
  errorText.value = ''
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
      const hasSession = await signUp(email.value, password.value)
      password.value = ''
      confirmPassword.value = ''
      if (hasSession) await router.replace('/conta')
      else message.value = 'Cadastro recebido. Confira seu e-mail e confirme o acesso antes de entrar.'
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

async function logout(): Promise<void> {
  busy.value = true
  errorText.value = ''
  message.value = ''
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
  errorText.value = ''
  message.value = ''
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
        <h1>Minha conta</h1>
        <p class="auth-subtitle">Confira sua sessão e teste a comunicação com a API.</p>
        <div v-if="!ready" class="auth-muted">Verificando sua sessão...</div>
        <template v-else-if="isLoggedIn">
          <div class="auth-identity"><UiIcon name="users" :size="20" />
            <div><small>Autenticado pelo Supabase</small><strong>{{ user?.email ?? 'Conta autenticada' }}</strong></div>
          </div>
          <div class="auth-warning"><UiIcon name="info" :size="20" /><span>Esta é uma autenticação real, mas os espaços e dados financeiros exibidos atualmente no navegador continuam locais. Ainda não estão protegidos por usuário nem sincronizados.</span></div>
          <button type="button" class="primary auth-full-button" :disabled="busy" @click="testApi">
            <UiIcon name="check" :size="17" /> {{ busy ? 'Verificando...' : 'Testar acesso à API protegida' }}
          </button>
          <p v-if="workspaceCount !== null" class="auth-muted">Espaços encontrados no banco da API: {{ workspaceCount }}. Os espaços locais do navegador são independentes.</p>
          <button type="button" class="secondary-action auth-full-button" :disabled="busy" @click="logout">Sair da conta Supabase</button>
        </template>
        <div v-else>
          <p class="auth-muted">Você ainda não entrou na sua conta.</p>
          <RouterLink class="primary auth-full-button" to="/entrar">Entrar</RouterLink>
        </div>
      </template>

      <template v-else>
        <h1>{{ mode === 'login' ? 'Entrar no Farol' : mode === 'signup' ? 'Criar uma conta' : mode === 'forgot' ? 'Recuperar minha senha' : 'Definir nova senha' }}</h1>
        <p class="auth-subtitle">{{ mode === 'login' ? 'Acesse com seu e-mail e sua senha.' : mode === 'signup' ? 'Crie seu acesso com segurança pelo Supabase.' : mode === 'forgot' ? 'Enviaremos um link de recuperação para seu e-mail.' : 'Digite a nova senha para sua conta.' }}</p>

        <div v-if="isLoggedIn && mode !== 'reset'" class="auth-info">
          Você já está autenticado. <RouterLink to="/conta">Ver minha conta</RouterLink>.
        </div>
        <form class="auth-form" @submit.prevent="submit">
          <label v-if="mode !== 'reset'">E-mail
            <input v-model.trim="email" type="email" autocomplete="email" required placeholder="voce@exemplo.com" maxlength="254" :disabled="busy || !configured" />
          </label>
          <label v-if="mode === 'login' || mode === 'signup' || mode === 'reset'">Senha
            <span class="auth-password-row">
              <input v-model="password" :type="showPassword ? 'text' : 'password'" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" required :minlength="mode === 'login' ? 1 : 8" :disabled="busy || !configured" :placeholder="mode === 'login' ? 'Sua senha' : 'Pelo menos 8 caracteres'" />
              <button class="auth-password-toggle" type="button" :disabled="busy" @click="showPassword = !showPassword">{{ showPassword ? 'Ocultar' : 'Mostrar' }}</button>
            </span>
          </label>
          <label v-if="mode === 'signup' || mode === 'reset'">Confirmar senha
            <input v-model="confirmPassword" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" minlength="8" required :disabled="busy || !configured" placeholder="Repita sua senha" />
          </label>
          <button class="primary auth-full-button" type="submit" :disabled="busy || !configured">
            {{ busy ? 'Processando...' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : mode === 'forgot' ? 'Enviar link de recuperação' : 'Salvar nova senha' }}
          </button>
        </form>

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
        <small>Protótipo: entrar ou sair não apaga e não isola os dados financeiros deste navegador.</small>
      </div>
    </div>
  </div>
</template>
