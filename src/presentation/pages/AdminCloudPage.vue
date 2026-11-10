<script setup lang="ts">
/**
 * Não lê dados financeiros nem armazenamento pessoal nesta área técnica.
 * A consulta de espaços pessoais continua no módulo normal com sua autorização.
 */
</script>

<template>
  <div class="admin-cloud-page">
    <div class="heading">
      <div>
        <p class="eyebrow">ÁREA SUPER ADMIN / DADOS NA NUVEM</p>
        <h1>Dados na nuvem</h1>
        <p>Orientações e acesso à nuvem da sua própria conta, sem permissões globais.</p>
      </div>
    </div>
    <section class="panel">
      <h2>Seus dados continuam privados</h2>
      <p>O papel Super Admin permite acessar ferramentas administrativas, mas não permite consultar automaticamente registros financeiros de outros usuários. Os espaços na nuvem seguem as regras próprias de autorização.</p>
      <p>Na Preview de autenticação Dev, as operações financeiras da API estão bloqueadas para testes. Não abra registros reais neste ambiente.</p>
      <RouterLink class="secondary-action" to="/dados-online">
        Sair do Super Admin e abrir meus dados no Farol
      </RouterLink>
      <RouterLink class="secondary-action" to="/administracao">Voltar à Administração</RouterLink>
    </section>
  </div>
</template>
