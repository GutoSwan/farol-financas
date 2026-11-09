<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { supabase } from '../../infrastructure/auth/supabase'
import { localLegacyAccess } from '../../infrastructure/persistence/legacyAccess'
import { buildLocalFinancialBackup } from '../../application/use-cases/exportFinancialBackup'
import {
  encryptFinancialBackup, inspectEncryptedFinancialBackup, summarizeFinancialBackup,
} from '../../infrastructure/backup/encryptedFinancialBackup'
import type { FinancialBackupSummary } from '../../infrastructure/backup/encryptedFinancialBackup'

const summary = ref<FinancialBackupSummary | null>(null)
const inspected = ref<FinancialBackupSummary | null>(null)
const loading = ref(true)
const busy = ref(false)
const errorText = ref('')
const message = ref('')
const approved = ref(false)
const password = ref('')
const passwordConfirmation = ref('')
const inspectionPassword = ref('')
const selectedFile = ref<File | null>(null)
const fileUrl = ref('')
const fileName = ref('')

async function confirmedOwner(): Promise<string> {
  if (!supabase) throw new Error('Autenticação não configurada.')
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Sessão inválida. Entre novamente.')
  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assuranceError || assurance?.currentLevel !== 'aal2') {
    throw new Error('Confirme seu segundo fator antes de acessar o backup.')
  }
  if (localLegacyAccess(data.user.id) !== 'allowed') {
    throw new Error('Os registros deste navegador não estão vinculados à conta atual.')
  }
  return data.user.id
}

function disposeDownload(): void {
  if (fileUrl.value) URL.revokeObjectURL(fileUrl.value)
  fileUrl.value = ''
  fileName.value = ''
}

async function refreshInventory(): Promise<void> {
  loading.value = true
  errorText.value = ''
  try {
    await confirmedOwner()
    summary.value = summarizeFinancialBackup(buildLocalFinancialBackup())
  } catch (cause) {
    summary.value = null
    errorText.value = cause instanceof Error ? cause.message : 'Não foi possível ler os dados locais.'
  } finally {
    loading.value = false
  }
}

async function prepareBackup(): Promise<void> {
  if (busy.value || loading.value || !approved.value) return
  errorText.value = ''
  message.value = ''
  busy.value = true
  try {
    if (password.value !== passwordConfirmation.value) {
      throw new Error('A confirmação da senha não corresponde.')
    }
    const owner = await confirmedOwner()
    const snapshot = buildLocalFinancialBackup()
    const encrypted = await encryptFinancialBackup(snapshot, password.value, owner)
    // Após a derivação da chave, recusar se outra conta entrou nesta aba.
    if (await confirmedOwner() !== owner) throw new Error('A sessão mudou durante a geração.')
    disposeDownload()
    const blob = new Blob([JSON.stringify(encrypted)], { type: 'application/json' })
    fileUrl.value = URL.createObjectURL(blob)
    fileName.value = 'farol-backup-criptografado-' + encrypted.createdAt.slice(0, 10) + '.json'
    summary.value = summarizeFinancialBackup(snapshot)
    message.value = 'Arquivo criptografado pronto para baixar. Guarde-o com sua senha em local seguro.'
  } catch (cause) {
    errorText.value = cause instanceof Error ? cause.message : 'Não foi possível criptografar o backup.'
  } finally {
    password.value = ''
    passwordConfirmation.value = ''
    busy.value = false
  }
}

function selectBackupFile(event: Event): void {
  inspected.value = null
  errorText.value = ''
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
  if (selectedFile.value && selectedFile.value.size > 9 * 1024 * 1024) {
    selectedFile.value = null
    input.value = ''
    errorText.value = 'Arquivo muito grande. Nenhum registro foi alterado.'
  }
}

async function inspectBackupFile(): Promise<void> {
  if (busy.value || !selectedFile.value) return
  busy.value = true
  errorText.value = ''
  inspected.value = null
  try {
    const owner = await confirmedOwner()
    const text = await selectedFile.value.text()
    const raw: unknown = JSON.parse(text)
    const result = await inspectEncryptedFinancialBackup(raw, inspectionPassword.value, owner)
    if (await confirmedOwner() !== owner) throw new Error('A sessão mudou durante a conferência.')
    inspected.value = result
    message.value = 'Integridade confirmada. O backup foi apenas conferido, sem restaurar ou enviar registros.'
  } catch (cause) {
    errorText.value = cause instanceof Error ? cause.message : 'Não foi possível conferir o backup.'
  } finally {
    inspectionPassword.value = ''
    busy.value = false
  }
}

onMounted(() => { void refreshInventory() })
onBeforeUnmount(disposeDownload)
</script>

<template>
  <div class="heading">
    <div>
      <p class="eyebrow">MIGRAÇÃO SEGURA · ETAPA 1</p>
      <h1>Backup financeiro protegido</h1>
      <p>Prepare uma cópia criptografada antes de migrarmos os registros deste navegador.</p>
    </div>
    <RouterLink class="secondary-action" to="/">Voltar à visão geral</RouterLink>
  </div>

  <section class="panel">
    <div class="panel-title">
      <div>
        <h2>1. Conferir o que será preservado</h2>
        <p>Somente contas, lançamentos, despesas fixas, orçamentos e espaços financeiros.</p>
      </div>
      <button type="button" class="secondary-action" :disabled="busy || loading" @click="refreshInventory">Atualizar</button>
    </div>
    <p v-if="loading" role="status">Verificando sua identidade e os registros locais...</p>
    <div v-else-if="summary">
      <ul class="backup-inventory">
        <li><strong>{{ summary.spaces }}</strong> espaços</li>
        <li><strong>{{ summary.bills }}</strong> contas mensais</li>
        <li><strong>{{ summary.monthlyEntries }}</strong> históricos mensais</li>
        <li><strong>{{ summary.fixedExpenses }}</strong> gastos fixos</li>
        <li><strong>{{ summary.transactions }}</strong> lançamentos</li>
        <li><strong>{{ summary.budgetProjects }}</strong> projetos de orçamento</li>
        <li><strong>{{ summary.budgetItems }}</strong> itens de orçamento</li>
        <li><strong>{{ summary.budgetQuotes }}</strong> cotações</li>
      </ul>
      <p class="auth-muted">Não inclui senhas, tokens Supabase, presentes, fotos ou dados de outros aplicativos.</p>
    </div>
  </section>

  <section class="panel backup-stage">
    <div class="panel-title">
      <div>
        <h2>2. Criptografar e guardar o arquivo</h2>
        <p>Proteção AES-256-GCM, senha exclusiva e derivação PBKDF2-SHA256 no próprio aparelho.</p>
      </div>
    </div>
    <p class="notice">A senha deste backup não pode ser recuperada pelo Farol. Salve o arquivo e a senha em locais seguros e separados. Nenhum dado será enviado à nuvem nesta etapa.</p>
    <form class="backup-form" @submit.prevent="prepareBackup">
      <label>
        Senha exclusiva do backup (mínimo de 14 caracteres)
        <input v-model="password" type="password" autocomplete="new-password"
          required minlength="14" maxlength="256" :disabled="busy || loading || !summary" />
      </label>
      <label>
        Confirme a senha
        <input v-model="passwordConfirmation" type="password" autocomplete="new-password"
          required minlength="14" maxlength="256" :disabled="busy || loading || !summary" />
      </label>
      <label class="calendar-check">
        <input v-model="approved" type="checkbox" :disabled="busy || loading || !summary" />
        Confirmo que estes registros são meus e quero gerar uma cópia criptografada.
      </label>
      <button type="submit" class="primary" :disabled="busy || loading || !summary || !approved">
        {{ busy ? 'Criptografando...' : 'Preparar backup seguro' }}
      </button>
    </form>
    <p v-if="fileUrl" class="success" role="status">
      Backup pronto:
      <a :href="fileUrl" :download="fileName" class="primary">Baixar arquivo criptografado</a>
    </p>
  </section>

  <section class="panel backup-stage">
    <div class="panel-title">
      <div>
        <h2>3. Conferir o backup salvo</h2>
        <p>Selecione o arquivo baixado e digite a senha para confirmar a integridade.</p>
      </div>
    </div>
    <form class="backup-form" @submit.prevent="inspectBackupFile">
      <label>
        Arquivo criptografado (.json)
        <input type="file" accept=".json,application/json" :disabled="busy" @change="selectBackupFile" />
      </label>
      <label>
        Senha usada no backup
        <input v-model="inspectionPassword" type="password" autocomplete="off" required :disabled="busy" />
      </label>
      <button type="submit" class="secondary-action" :disabled="busy || !selectedFile">
        Conferir sem restaurar
      </button>
    </form>
    <p v-if="inspected" class="success" role="status">
      Arquivo íntegro: {{ inspected.spaces }} espaços, {{ inspected.transactions }} lançamentos,
      {{ inspected.bills }} contas mensais e {{ inspected.monthlyEntries }} históricos.
    </p>
    <p class="auth-muted">Conferir não grava no navegador nem importa para o Supabase. A migração com autorização e prevenção de duplicações será uma etapa separada.</p>
  </section>
  <p v-if="message" class="success" role="status">{{ message }}</p>
  <p v-if="errorText" class="error" role="alert">{{ errorText }}</p>
</template>

<style scoped>
.backup-inventory { display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: .7rem; margin: 1rem 0; padding-left: 1.1rem; }
.backup-inventory li { line-height: 1.6; }
.backup-stage { margin-top: 1.25rem; }
.backup-form { display: grid; gap: .85rem; max-width: 520px; }
.backup-form label:not(.calendar-check) { display: grid; gap: .3rem; }
.backup-form input[type="password"], .backup-form input[type="file"] { max-width: 100%; min-width: 0; }
.backup-stage .success a { display: inline-flex; margin: .5rem 0; padding: .6rem .9rem; text-decoration: none; }
</style>
