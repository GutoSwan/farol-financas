<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
 import { supabase } from '../../infrastructure/auth/supabase'
import { localLegacyAccess } from '../../infrastructure/persistence/legacyAccess'
import { getOnlineIdentity, listOnlineWorkspaces } from '../../infrastructure/api/onlineWorkspaces'
import { readOnlineFinance } from '../../infrastructure/api/onlineFinance'
import { compareLocalAndCloud, normalizeName, MODULES } from '../../domain/services/cloudSyncPreflight'
import type { CloudPreflightReport, RemoteSample, Counts } from '../../domain/services/cloudSyncPreflight'
import { analyzeLegacyMigration } from '../../application/use-cases/analyzeLegacyMigration'
import type { MigrationPreview } from '../../application/use-cases/analyzeLegacyMigration'
import { buildLocalFinancialBackup } from '../../application/use-cases/exportFinancialBackup'
import {
  encryptFinancialBackup, decryptVerifiedFinancialBackup, inspectEncryptedFinancialBackupWithFingerprint, fingerprintFinancialBackup,
  summarizeFinancialBackup,
} from '../../infrastructure/backup/encryptedFinancialBackup'
import type { FinancialBackupSummary } from '../../infrastructure/backup/encryptedFinancialBackup'
import { restoreLocalFinancialBackup, mayRestoreIntoCurrentBrowser } from '../../infrastructure/backup/restoreLocalFinancialBackup'

 const summary = ref<FinancialBackupSummary | null>(null)
const inspected = ref<FinancialBackupSummary | null>(null)
const inspectedFingerprint = ref('')
const inspectedOwner = ref('')
const preview = ref<MigrationPreview | null>(null)
const analyzing = ref(false)
const analysisError = ref('')
const loading = ref(true)
const busy = ref(false)
const errorText = ref('')
const message = ref('')
const approved = ref(false)
const password = ref('')
const passwordConfirmation = ref('')
const inspectionPassword = ref('')
const restorationPassword = ref('')
const restorationConsent = ref('')
const restoredSuccessfully = ref(false)
const cloudBusy = ref(false)
const cloudError = ref('')
const cloudReport = ref<CloudPreflightReport | null>(null)
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

function clearInspectedBackup(): void {
  inspected.value = null
  inspectedFingerprint.value = ''
  inspectedOwner.value = ''
  preview.value = null
  restorationConsent.value = ''
  restorationPassword.value = ''
  cloudError.value = ''
  cloudReport.value = null
}

function disposeDownload(): void {
  if (fileUrl.value) URL.revokeObjectURL(fileUrl.value)
  fileUrl.value = ''
  fileName.value = ''
}

async function refreshInventory(): Promise<void> {
  clearInspectedBackup()
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
  clearInspectedBackup()
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
  clearInspectedBackup()
  restoredSuccessfully.value = false
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
  clearInspectedBackup()
  busy.value = true
  errorText.value = ''
  try {
    const owner = await confirmedOwner()
    const text = await selectedFile.value.text()
    const raw: unknown = JSON.parse(text)
    const result = await inspectEncryptedFinancialBackupWithFingerprint(raw, inspectionPassword.value, owner)
    if (await confirmedOwner() !== owner) throw new Error('A sessão mudou durante a conferência.')
    inspected.value = result.summary
    inspectedFingerprint.value = result.fingerprint
    inspectedOwner.value = owner
    message.value = 'Integridade confirmada. O backup foi apenas conferido, sem restaurar ou enviar registros.'
  } catch (cause) {
    errorText.value = cause instanceof Error ? cause.message : 'Não foi possível conferir o backup.'
  } finally {
    inspectionPassword.value = ''
    busy.value = false
  }
}

async function restoreInspectedFile(): Promise<void> {
  if (busy.value || loading.value || !selectedFile.value || !inspected.value ||
      !inspectedFingerprint.value || !inspectedOwner.value || restorationConsent.value !== 'RESTAURAR') return
  busy.value = true
  errorText.value = ''
  message.value = ''
  try {
    const owner = await confirmedOwner()
    if (owner !== inspectedOwner.value) throw new Error('A sessão mudou. Confira o arquivo novamente.')
    if (!mayRestoreIntoCurrentBrowser(owner)) {
      throw new Error('Este navegador não está vazio. A restauração só é permitida sem outros registros financeiros.')
    }
    const raw: unknown = JSON.parse(await selectedFile.value.text())
    const snapshot = await decryptVerifiedFinancialBackup(raw, restorationPassword.value, owner)
    if (await fingerprintFinancialBackup(snapshot) !== inspectedFingerprint.value) {
      throw new Error('O arquivo mudou desde a conferência. Confira novamente antes de restaurar.')
    }
    if (await confirmedOwner() !== owner) throw new Error('A sessão mudou durante a conferência.')
    // Após a última verificação remota, nenhuma chamada assíncrona separa
    // a checagem da sessão do início das gravações locais.
    const result = restoreLocalFinancialBackup(snapshot, owner)
    restoredSuccessfully.value = true
    summary.value = result
    message.value = 'Restauração local concluída. Atualize o Farol para recarregar os espaços e os registros recuperados.'
    clearInspectedBackup()
  } catch (cause) {
    errorText.value = cause instanceof Error ? cause.message : 'A restauração não pôde ser concluída.'
  } finally {
    restorationPassword.value = ''
    restorationConsent.value = ''
    busy.value = false
  }
}

async function compareWithCloud(): Promise<void> {
  if (cloudBusy.value || busy.value || analyzing.value || !inspectedFingerprint.value || !inspectedOwner.value) return
  cloudBusy.value = true
  cloudError.value = ''
  cloudReport.value = null
  try {
    const owner = await confirmedOwner()
    if (owner !== inspectedOwner.value) throw new Error('Sessão alterada desde a conferência do backup.')
    const snapshot = buildLocalFinancialBackup()
    if (await fingerprintFinancialBackup(snapshot) !== inspectedFingerprint.value) {
      throw new Error('Os dados locais mudaram. Gere e confira um novo backup.')
    }
    const identity = await getOnlineIdentity()
    if (identity.id !== owner) throw new Error('Identidade da API não corresponde à conta autenticada.')
    const remote = await listOnlineWorkspaces()
    const candidates = remote.filter(r => r.role === 'OWNER' &&
      remote.filter(x=>normalizeName(x.name)===normalizeName(r.name)).length===1 &&
      snapshot.workspaces.filter(x=>normalizeName(x.workspace.name)===normalizeName(r.name)).length===1)
    if (candidates.length > 8) throw new Error('Muitos espaços para uma única consulta. Nenhum dado foi enviado.')
    const samples:RemoteSample[]=[]
    for (const workspace of candidates) {
      const counts:Counts={transactions:0,'recurring-bills':0,'fixed-expenses':0,budgets:0}
      for (const kind of MODULES) {
        const records=await readOnlineFinance(workspace,kind,owner)
        counts[kind]=records.length
      }
      samples.push({workspaceId:workspace.id,counts})
    }
    if (await confirmedOwner() !== owner ||
        await fingerprintFinancialBackup(buildLocalFinancialBackup()) !== inspectedFingerprint.value) {
      throw new Error('A sessão ou os dados locais mudaram durante a conferência.')
    }
    cloudReport.value=compareLocalAndCloud(snapshot,remote,samples)
  } catch(cause) {
    cloudError.value=cause instanceof Error?cause.message:'Não foi possível analisar a nuvem.'
  } finally { cloudBusy.value=false }
}

async function simulateMigration(): Promise<void> {
  if (busy.value || analyzing.value || !inspected.value || !inspectedFingerprint.value || loading.value) return
  analyzing.value = true
  analysisError.value = ''
  preview.value = null
  try {
    const owner = await confirmedOwner()
    if (inspectedOwner.value !== owner) {
      throw new Error('O backup conferido pertence a outra sessão. Confira novamente o arquivo.')
    }
    const currentSnapshot = buildLocalFinancialBackup()
    if (await fingerprintFinancialBackup(currentSnapshot) !== inspectedFingerprint.value) {
      throw new Error('Os registros locais mudaram desde o backup conferido. Gere e confira um novo backup.')
    }
    // A API recebe apenas o JWT necessário a GET /me e GET /workspaces.
    // Nenhum lançamento, histórico, orçamento ou snapshot é enviado.
    let onlineSpaces: Awaited<ReturnType<typeof listOnlineWorkspaces>> | null = null
    try {
      const identity = await getOnlineIdentity()
      if (identity.id !== owner) throw new Error('Identidade da API diferente da conta autenticada.')
      onlineSpaces = await listOnlineWorkspaces()
    } catch (cause) {
      // Preview sem API permite análise LOCAL, mas nunca declara a nuvem verificada.
      if (cause instanceof Error && cause.message.includes('Identidade da API diferente')) throw cause
      onlineSpaces = null
    }
    if (await confirmedOwner() !== owner) throw new Error('Sessão alterada durante a análise.')
    const result = analyzeLegacyMigration(currentSnapshot, onlineSpaces)
    // Se algo mudar enquanto a API responde, descartar o relatório anterior.
    if (await fingerprintFinancialBackup(buildLocalFinancialBackup()) !== inspectedFingerprint.value) {
      throw new Error('Os registros locais mudaram durante a análise. Gere um novo backup.')
    }
    if (await confirmedOwner() !== owner) throw new Error('Sessão alterada durante a análise.')
    preview.value = result
  } catch (cause) {
    analysisError.value = cause instanceof Error ? cause.message : 'Não foi possível simular a migração.'
  } finally {
    analyzing.value = false
  }
}

function refreshAfterRestore(): void {
  window.location.reload()
}

onMounted(() => { void refreshInventory() })
onBeforeUnmount(disposeDownload)
</script>

<template>
  <div class="heading">
    <div>
      <p class="eyebrow">PROTEÇÃO DE DADOS · BACKUP E RESTAURAÇÃO</p>
      <h1>Backup financeiro protegido</h1>
      <p>Exporte, confira ou restaure um backup criptografado neste navegador, sem substituir registros existentes.</p>
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
  <section class="panel backup-stage" aria-label="Restauração local">
    <div class="panel-title">
      <div>
        <h2>4. Restaurar o backup neste navegador</h2>
        <p>Somente para um destino sem registros financeiros. Nunca substitui dados existentes.</p>
      </div>
    </div>
    <p class="auth-warning">
      Antes de começar: utilize uma conta financeira com Authenticator confirmado e um navegador
      já vinculado a essa conta, porém sem lançamentos, contas, espaços extras ou orçamentos.
      A restauração acontece somente neste aparelho, não na nuvem. Guarde o arquivo original.
    </p>
    <p v-if="inspected" class="notice">
      O arquivo conferido contém {{ inspected.spaces }} espaços, {{ inspected.transactions }} lançamentos,
      {{ inspected.monthlyEntries }} históricos e {{ inspected.budgetProjects }} projetos de orçamento.
      Se já houver dados no navegador, a operação será bloqueada sem mesclar ou apagar registros.
    </p>
    <form class="backup-form" @submit.prevent="restoreInspectedFile">
      <label>
        Senha do backup conferido
        <input v-model="restorationPassword" type="password" autocomplete="off"
          required :disabled="busy || !inspected || restoredSuccessfully" />
      </label>
      <label>
        Para confirmar, digite RESTAURAR
        <input v-model.trim="restorationConsent" type="text" autocomplete="off"
          required :disabled="busy || !inspected || restoredSuccessfully" placeholder="RESTAURAR" />
      </label>
      <button type="submit" class="primary"
        :disabled="busy || loading || !inspected || !selectedFile || restoredSuccessfully ||
          restorationConsent !== 'RESTAURAR' || !restorationPassword">
        {{ busy ? 'Verificando...' : 'Restaurar somente em destino vazio' }}
      </button>
    </form>
    <p v-if="restoredSuccessfully" class="success" role="status">
      Restauração concluída. <button type="button" class="secondary-action"
        @click="refreshAfterRestore">Atualizar para ver meus dados</button>
    </p>
  </section>
  <section class="panel backup-stage" aria-label="Simulação da migração">
    <div class="panel-title">
      <div>
        <h2>5. Simular a migração sem gravar nada</h2>
        <p>Confira limites de valores, datas, vínculos dos orçamentos e possíveis conflitos de espaços.</p>
      </div>
    </div>
    <p class="auth-muted">
      Primeiro confirme a integridade do arquivo no passo 3. A simulação confere
      que os dados atuais são exatamente os mesmos do backup validado; caso tenham mudado, gere outra cópia.
      A API recebe apenas consultas de identidade e nomes dos espaços já salvos na sua conta.
      Nenhuma informação financeira local é enviada.
    </p>
    <button type="button" class="primary" :disabled="!inspected || analyzing || busy || loading"
      @click="simulateMigration">
      {{ analyzing ? 'Analisando...' : 'Verificar compatibilidade da migração' }}
    </button>
    <p v-if="analysisError" class="error" role="alert">{{ analysisError }}</p>
    <template v-if="preview">
      <p class="backup-result" role="status">
        <strong>{{ preview.blockers }} impedimentos</strong> ·
        <strong>{{ preview.warnings }} avisos</strong> ·
        <strong>{{ preview.requiresRemapping }} identificadores a mapear</strong>
      </p>
      <p v-if="preview.readyForImportDesign" class="success">
        A estrutura analisada não apresentou impedimentos conhecidos.
        Isso ainda NÃO autoriza a importação, que depende de implementação, comparação por registro e testes.
      </p>
      <p v-else class="auth-warning">
        Existem incompatibilidades a revisar antes de importar. Nenhum registro foi enviado, criado ou excluído.
      </p>
      <p class="auth-muted">
        {{ preview.cloudComparison === 'not-checked'
          ? 'Sem conexão com a API: somente os dados locais foram analisados. Não é seguro iniciar uma importação.'
          : 'A comparação online cobre apenas nomes de espaços. Duplicações de lançamentos dentro da nuvem ainda não podem ser descartadas.' }}
      </p>
      <ul v-if="preview.issues.length" class="backup-issues">
        <li v-for="(issue, index) in preview.issues" :key="index">
          <strong>{{ issue.severity === 'blocker' ? 'Impedimento' : 'Aviso' }} · {{ issue.code }}</strong>
          <span>{{ issue.location }}: {{ issue.message }}</span>
        </li>
      </ul>
      <p v-if="preview.truncated" class="auth-warning">
        Há mais ocorrências além das exibidas. Nenhum dado será importado automaticamente.
      </p>
    </template>
  </section>
  <section class="panel backup-stage" aria-label="Comparação com a nuvem">
    <div class="panel-title"><div>
      <h2>6. Comparar dados locais com a nuvem</h2>
      <p>Prévia somente leitura, sem sincronização automática ou gravação.</p>
    </div></div>
    <p class="notice">Com o backup conferido, vamos consultar os quatro módulos dos espaços
      online que pertencem à sua conta. Nada do seu navegador será enviado. Nomes
      iguais não comprovam que dois espaços possuem a mesma identidade.</p>
    <button type="button" class="secondary-action"
      :disabled="!inspected || busy || analyzing || cloudBusy || loading"
      @click="compareWithCloud">
      {{ cloudBusy ? 'Comparando...' : 'Comparar com a nuvem (somente leitura)' }}
    </button>
    <p v-if="cloudError" class="error" role="alert">{{ cloudError }}</p>
    <template v-if="cloudReport">
      <p class="backup-result" role="status">{{ cloudReport.entries.length }} espaços examinados,
        {{ cloudReport.warnings }} exigem revisão.</p>
      <p class="auth-warning">A importação permanece bloqueada até termos um
        mapeamento seguro e idempotente. Esta consulta não sincronizou dados.</p>
      <ul class="backup-issues">
        <li v-for="entry in cloudReport.entries" :key="entry.localId">
          <strong>{{ entry.name }} · {{ entry.status === 'missing' ? 'Sem correspondência' :
            entry.status === 'ambiguous' ? 'Nome duplicado na nuvem' :
            entry.status === 'not-owner' ? 'Sem permissão de proprietário' :
            entry.status === 'truncated' ? 'Consulta incompleta' :
            entry.status === 'occupied' ? 'Já existem dados na nuvem' :
            'Módulos online consultados vazios' }}</strong>
          <span>{{ entry.detail }}</span>
          <small>Local: {{ entry.localCounts.transactions }} lançamentos,
            {{ entry.localCounts['recurring-bills'] }} contas,
            {{ entry.localCounts['fixed-expenses'] }} gastos fixos,
            {{ entry.localCounts.budgets }} orçamentos</small>
          <small v-if="entry.remoteCounts">Nuvem: {{ entry.remoteCounts.transactions }} lançamentos,
            {{ entry.remoteCounts['recurring-bills'] }} contas,
            {{ entry.remoteCounts['fixed-expenses'] }} gastos fixos,
            {{ entry.remoteCounts.budgets }} orçamentos (até 50 por módulo)</small>
        </li>
      </ul>
    </template>
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
.backup-result { margin-top: 1rem; }
.backup-issues { display: grid; gap: .65rem; margin-top: 1rem; padding-left: 1.2rem; }
.backup-issues li { display: grid; gap: .25rem; overflow-wrap: anywhere; }
</style>
