<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { createClient } from '@supabase/supabase-js'

const devUrl = 'https://tvirkrjkgdtybtcundon.supabase.co'
const url = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const publicKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
// Nunca aceitar credenciais de Production ou chaves privilegiadas nesta Preview.
const configured = url === devUrl && publicKey.startsWith('sb_publishable_')
const supabase = configured ? createClient(url, publicKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
    storageKey: 'farol-admin-web-dev-v1' }
}) : null
const paths = { painel: '/admin', backup: '/admin/backup',
  nuvem: '/admin/nuvem', seguranca: '/admin/seguranca' }
const titles = { painel: 'Painel', backup: 'Backup', nuvem: 'Dados na nuvem', seguranca: 'Segurança' }
const activePath = ref(location.pathname)
const section = computed(() => Object.keys(paths).find(k => paths[k] === activePath.value) || 'painel')
const gate = ref('checking')
const email = ref('')
const password = ref('')
const code = ref('')
const user = ref(null)
const factors = ref([])
const factorId = ref('')
const busy = ref(false)
const message = ref('')
const checkedAt = ref('')
const mobileMenu = ref(false)
let currentCheck = 0
let mounted = true
function navigate(url) {
  if (!Object.values(paths).includes(url) && url !== '/admin/login') return
  history.pushState({}, '', url)
  activePath.value = url
  mobileMenu.value = false
  document.title = (url === '/admin/login' ? 'Acesso restrito' : titles[section.value]) + ' | Farol Admin'
}
function onPop() {
  activePath.value = location.pathname
  mobileMenu.value = false
  if (!Object.values(paths).includes(activePath.value) && activePath.value !== '/admin/login') navigate('/admin')
}
async function logout(note = '') {
  const attempt = ++currentCheck
  gate.value = 'checking'
  user.value = null
  factors.value = []
  factorId.value = ''
  checkedAt.value = ''
  try { await supabase?.auth.signOut() } catch { /* falha fechada */ }
  if (!mounted || attempt !== currentCheck) return
  message.value = note
  password.value = ''
  code.value = ''
  gate.value = 'login'
  navigate('/admin/login')
}
async function serverAuthorizes() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) return false
  const response = await fetch('/api/v1/admin/access', {
    headers: { Authorization: 'Bearer ' + data.session.access_token }, cache: 'no-store'
  })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false
  const result = await response.json()
  return result?.data?.superAdmin === true
}
async function restore() {
  const attempt = ++currentCheck
  gate.value = 'checking'
  message.value = ''
  if (!supabase) {
    gate.value = 'blocked'
    message.value = 'Supabase Dev não configurado. O acesso está bloqueado.'
    return
  }
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!mounted || attempt !== currentCheck) return
    if (error || !data.user) { gate.value = 'login'; navigate('/admin/login'); return }
    if (data.user.app_metadata?.farol_role !== 'super_admin') {
      await logout('Esta conta não tem autorização Super Admin.')
      return
    }
    user.value = data.user
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalError || aal?.nextLevel !== 'aal2') throw new Error('TOTP obrigatório')
    const { data: registered, error: factorsError } = await supabase.auth.mfa.listFactors()
    if (factorsError || !registered) throw new Error('Falha de fatores')
    factors.value = registered.totp.filter(f => f.status === 'verified')
    if (!factors.value.length) throw new Error('TOTP não disponível')
    factorId.value = factors.value[0].id
    if (aal.currentLevel !== 'aal2') { gate.value = 'second-factor'; return }
    if (!await serverAuthorizes()) throw new Error('API não confirmou permissão')
    if (!mounted || attempt !== currentCheck) return
    gate.value = 'authorized'
    checkedAt.value = new Date().toLocaleString('pt-BR')
    if (!Object.values(paths).includes(activePath.value)) navigate('/admin')
  } catch {
    if (!mounted || attempt !== currentCheck) return
    gate.value = 'blocked'
    message.value = 'A API não confirmou identidade, permissão e segundo fator. Acesso bloqueado por segurança.'
  }
}
async function login() {
  if (busy.value || !supabase) return
  busy.value = true
  message.value = ''
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: password.value })
    password.value = ''
    if (error) throw error
    await restore()
  } catch {
    password.value = ''
    message.value = 'Não foi possível entrar. Verifique e-mail, senha e permissões.'
  } finally { busy.value = false }
}
async function verify() {
  if (busy.value || !supabase || !/^\d{6}$/.test(code.value)) return
  busy.value = true
  message.value = ''
  try {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factorId.value, code: code.value })
    code.value = ''
    if (error) throw error
    await restore()
  } catch {
    code.value = ''
    message.value = 'Código Authenticator não confirmado.'
  } finally { busy.value = false }
}
onMounted(() => {
  if (!activePath.value.startsWith('/admin')) navigate('/admin/login')
  window.addEventListener('popstate', onPop)
  void restore()
})
onBeforeUnmount(() => { mounted = false; currentCheck++; window.removeEventListener('popstate', onPop) })
</script>

<template>
  <div class="admin-site">
    <div class="stripe"><span class="dot"></span> FAROL ADMIN <span class="slash">/</span> CONSOLE WEB INDEPENDENTE <span class="dev-label">AMBIENTE DEV</span></div>
    <div v-if="gate !== 'authorized'" class="auth-grid">
      <section class="brand-side">
        <div class="symbol">F<span>◆</span></div>
        <div class="eyebrow">ACESSO EXCLUSIVAMENTE ADMINISTRATIVO</div>
        <h1>Um painel separado.<br><em>Uma identidade própria.</em></h1>
        <p>O Farol Admin não faz parte do aplicativo financeiro. A entrada exige senha, Authenticator e autorização pelo servidor.</p>
        <div class="milestones"><span>01 · Identidade</span><span>02 · Autenticador</span><span>03 · API</span></div>
      </section>
      <section class="login-side">
        <div class="auth-card">
          <div class="eyebrow">ACESSO RESTRITO • WEB</div>
          <h2 v-if="gate === 'checking'">Validando acesso</h2>
          <h2 v-else-if="gate === 'second-factor'">Segundo fator</h2>
          <h2 v-else-if="gate === 'blocked'">Acesso bloqueado</h2>
          <h2 v-else>Entrar no Farol Admin</h2>
          <p class="hint">Somente contas Super Admin autorizadas. Não existe cadastro público neste ambiente.</p>
          <p v-if="message" class="warning" role="alert">{{ message }}</p>
          <p v-if="gate === 'checking'" role="status" class="hint">Conferindo identidade e permissões...</p>
          <form v-if="gate === 'login'" @submit.prevent="login">
            <label for="email">E-mail administrativo</label><input id="email" v-model="email" type="email" autocomplete="username" required>
            <label for="password">Senha</label><input id="password" v-model="password" type="password" autocomplete="current-password" required>
            <button class="primary" :disabled="busy || !configured">Entrar no console <span>↗</span></button>
          </form>
          <form v-else-if="gate === 'second-factor'" @submit.prevent="verify">
            <label for="code">Código do Authenticator</label>
            <input id="code" v-model="code" type="text" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" placeholder="000000" required>
            <button class="primary" :disabled="busy || !/^\d{6}$/.test(code)">Confirmar identidade <span>↗</span></button>
            <button class="secondary" type="button" @click="logout()">Voltar ao login</button>
          </form>
          <button v-else-if="gate === 'blocked'" type="button" class="primary" @click="restore()">Revalidar sessão <span>↻</span></button>
          <button v-if="gate === 'blocked'" type="button" class="secondary" @click="logout()">Encerrar sessão</button>
          <div class="foot-note">◈ Console dedicado ao navegador. Sem PWA e sem acesso pelo Farol normal.</div>
        </div>
      </section>
    </div>
    <div v-else class="app-shell">
      <aside class="sidebar" :class="{ open: mobileMenu }">
        <div class="identity"><div class="small-symbol">F◆</div><div><small>PLATAFORMA TÉCNICA</small><strong>Farol Admin</strong></div></div>
        <div class="sidebar-label">FERRAMENTAS DO CONSOLE</div>
        <nav aria-label="Navegação administrativa">
          <button v-for="(href, key, index) in paths" :key="href" type="button"
            :class="{ selected: section === key }" :aria-current="section === key ? 'page' : undefined"
            @click="navigate(href)"><span>0{{ index + 1 }}</span>{{ titles[key] }}<b>↗</b></button>
        </nav>
        <div class="sidebar-bottom"><div class="connected"><span class="dot"></span> AUTORIZAÇÃO CONFIRMADA</div><small>{{ user?.email }}</small><button class="logout" @click="logout()">Encerrar sessão ↗</button></div>
      </aside>
      <div class="main-column">
        <header class="topbar"><button class="hamburger" aria-label="Abrir menu" @click="mobileMenu = !mobileMenu">☰</button><span>CONSOLE <i>/</i> {{ titles[section].toUpperCase() }}</span><strong>SUPER ADMIN · DEV</strong></header>
        <main>
          <div class="page-title"><div><div class="eyebrow">AMBIENTE WEB ISOLADO</div><h1>{{ titles[section] }}</h1></div><span>SESSÃO RESTRITA</span></div>
          <template v-if="section === 'painel'">
            <section class="hero"><div class="eyebrow">ADMINISTRATIVE OPERATIONS CENTER</div><h2>Controle técnico.<br>Proteção desde a entrada.</h2><p>Você está no painel independente do Farol Admin. Sua identidade foi conferida pelo servidor com MFA AAL2.</p><span class="pill">SESSÃO VERIFICADA</span></section>
            <div class="metrics"><article><small>ACESSO</small><strong>Super Admin</strong><p>Papel conferido pela API</p></article><article><small>SEGURANÇA</small><strong>TOTP ativo</strong><p>Segundo fator obrigatório</p></article><article><small>CONTEXTO</small><strong>Dev</strong><p>Produção preservada</p></article></div>
            <section class="panel"><h3>Ferramentas administrativas</h3><p>As funções que alteram dados globais ainda estão desativadas até serem auditadas.</p><div class="actions"><button @click="navigate('/admin/backup')">Backup ↗</button><button @click="navigate('/admin/nuvem')">Dados na nuvem ↗</button><button @click="navigate('/admin/seguranca')">Segurança ↗</button></div></section>
          </template>
          <template v-else-if="section === 'backup'"><section class="panel"><div class="eyebrow">BACKUPS ADMINISTRATIVOS</div><h2>Backup protegido</h2><p>Este site não lê os dados financeiros locais do Farol. A criação de backups administrativos e restaurações exige endpoints separados, criptografia e auditoria.</p><p class="readonly">Somente consulta · Sem exportação, exclusão ou restauração nesta Preview.</p></section></template>
          <template v-else-if="section === 'nuvem'"><section class="panel"><div class="eyebrow">SEGREGAÇÃO DE DADOS</div><h2>Dados na nuvem</h2><p>O papel Super Admin não concede acesso automático às despesas, lançamentos, contas ou cartões de outras pessoas. Nenhum registro financeiro é carregado aqui.</p><p class="readonly">Acesso financeiro global desabilitado.</p></section></template>
          <template v-else><section class="panel"><div class="eyebrow">CONFIRMAÇÃO DE IDENTIDADE</div><h2>Segurança e acesso</h2><p>Identidade verificada pelo Supabase Dev, Authenticator e API do Farol.</p><dl><div><dt>Usuário</dt><dd>{{ user?.email }}</dd></div><div><dt>Autenticadores verificados</dt><dd>{{ factors.length }}</dd></div><div><dt>Verificação da API</dt><dd>{{ checkedAt }}</dd></div></dl><p>Para desativar TOTP, é necessário um procedimento separado de recuperação de identidade. Esta tela não remove fatores.</p><button class="outline" @click="restore()">Revalidar autorização ↻</button></section></template>
        </main>
        <footer>FAROL ADMIN / CONSOLE WEB <span>PREVIEW · AMBIENTE DEV</span></footer>
      </div>
    </div>
  </div>
</template>
