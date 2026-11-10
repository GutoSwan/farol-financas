<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { verifySuperAdminAccess } from '../../infrastructure/auth/superAdminAccess'

const checking = ref(true)
const authorized = ref(false)

onMounted(async () => {
  authorized.value = await verifySuperAdminAccess()
  checking.value = false
})
</script>

<template>
  <div class="admin-page">
    <div class="heading">
      <div>
        <p class="eyebrow">ACESSO RESTRITO</p>
        <h1>Administração do Farol</h1>
        <p>Ferramentas técnicas separadas das opções do dia a dia.</p>
      </div>
    </div>
    <p v-if="checking" role="status" class="panel">Conferindo seu acesso com segurança...</p>
    <section v-else-if="!authorized" class="panel" role="alert">
      <h2>Acesso não autorizado</h2>
      <p>Esta área exige uma conta Super Admin, autenticação em duas etapas e confirmação pelo servidor. Se a API estiver indisponível, o acesso permanece bloqueado.</p>
      <RouterLink class="secondary-action" to="/">Voltar à visão geral</RouterLink>
    </section>
    <template v-else>
      <p class="notice">O Super Admin pode acompanhar ferramentas técnicas, mas não ganha acesso automático aos dados particulares de outras pessoas.</p>
      <div class="admin-tools">
        <section class="panel">
          <h2>Backup protegido</h2>
          <p>Crie ou confira uma cópia criptografada dos dados locais autorizados neste navegador. Nenhum backup é enviado automaticamente.</p>
          <RouterLink class="secondary-action" to="/backup-local">Abrir backup seguro</RouterLink>
        </section>
        <section class="panel">
          <h2>Dados na nuvem</h2>
          <p>Consulte apenas os espaços vinculados à sua conta. A API verifica a autorização para cada espaço, mesmo para um Super Admin.</p>
          <RouterLink class="secondary-action" to="/dados-online">Abrir meus dados na nuvem</RouterLink>
        </section>
        <section class="panel">
          <h2>Segurança da conta</h2>
          <p>Revise seus autenticadores e métodos de acesso sem mostrar senhas ou chaves de servidor.</p>
          <RouterLink class="secondary-action" to="/seguranca">Ver segurança</RouterLink>
        </section>
      </div>
      <p class="admin-note">Criação de contas administradoras, restauração e exclusão de registros globais continuam indisponíveis nesta versão. Essas operações exigem procedimentos próprios e auditoria.</p>
    </template>
  </div>
</template>
