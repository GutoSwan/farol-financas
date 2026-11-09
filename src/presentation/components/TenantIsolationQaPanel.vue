<script setup lang="ts">
import { ref, watch } from 'vue'
import type { OnlineWorkspace } from '../../infrastructure/api/onlineWorkspaces'
import { runTenantIsolationQa } from '../../infrastructure/api/tenantIsolationQa'
import type { IsolationReport, QaModule } from '../../infrastructure/api/tenantIsolationQa'

const props = defineProps<{ userId: string; workspaces: OnlineWorkspace[] }>()
const busy = ref(false)
const report = ref<IsolationReport | null>(null)
const errorText = ref('')

const titles: Record<QaModule, string> = {
  'transactions': 'Lançamentos',
  'recurring-bills': 'Contas mensais',
  'fixed-expenses': 'Gastos fixos',
  'budgets': 'Orçamentos',
}

watch(() => [props.userId, props.workspaces], () => {
  report.value = null
  errorText.value = ''
})

async function runTest(): Promise<void> {
  if (busy.value) return
  report.value = null
  errorText.value = ''
  busy.value = true
  try {
    report.value = await runTenantIsolationQa(props.userId)
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : 'Teste não pôde ser concluído.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="qa-isolation" aria-labelledby="qa-isolation-title">
    <h2 id="qa-isolation-title">🔐 Testar isolamento de dados (somente QA)</h2>
    <p>Este teste usa sua sessão atual com 2FA para tentar ler dados do espaço de outra conta. Nenhum lançamento é criado ou alterado.</p>
    <p>O servidor deve responder <strong>404</strong> em todos os quatro módulos. Sua senha, seus códigos e seu token não serão exibidos.</p>
    <button type="button" class="primary" :disabled="busy" @click="runTest">
      {{ busy ? 'Verificando permissões...' : 'Executar teste de isolamento' }}
    </button>
    <p v-if="errorText" role="alert" class="qa-error">{{ errorText }}</p>
    <div v-if="report" :class="['qa-result', 'qa-' + report.status]" :role="report.status === 'failed' ? 'alert' : 'status'">
      <strong>
        {{ report.status === 'passed' ? '✅ Isolamento confirmado' :
          report.status === 'failed' ? '⛔ Falha de segurança detectada' : '⚠️ Teste inconclusivo' }}
      </strong>
      <p>Conta {{ report.own }}: {{ report.message }}</p>
      <ul>
        <li v-for="item in report.checks" :key="item.module">
          <span>{{ titles[item.module] }}</span>
          <strong>{{ item.status === 'passed' ? 'Bloqueado (404)' :
            item.status === 'failed' ? 'FALHA (200)' : 'Inconclusivo' }}</strong>
        </li>
      </ul>
      <p v-if="report.status === 'failed'">Não utilize dados financeiros reais até que esta falha seja corrigida no servidor.</p>
    </div>
  </section>
</template>

<style scoped>
.qa-isolation { margin-top: 1.3rem; padding: 1.2rem; border: 1px solid #bac9d8; border-radius: 14px; background: #edf2f8; color: #20324a; }
.qa-isolation h2 { font-size: 1.12rem; margin: 0 0 .55rem; }
.qa-isolation p { line-height: 1.55; margin: .4rem 0 .9rem; }
.qa-isolation button { padding: .72rem .95rem; border-radius: 8px; }
.qa-result { margin-top: 1rem; border: 1px solid #d3dae2; padding: .8rem; border-radius: 10px; }
.qa-passed { border-color: #8ec8a5; background: #e4f6e9; color: #165b36; }
.qa-failed { border-color: #f1a5a5; background: #fde7e7; color: #a21b1b; }
.qa-inconclusive { border-color: #e5bc78; background: #fff7df; color: #745518; }
.qa-result ul { list-style: none; padding: 0; margin: .6rem 0 0; }
.qa-result li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem; padding: .5rem 0; border-top: 1px solid currentColor; }
.qa-error { color: #a21b1b; }
</style>
