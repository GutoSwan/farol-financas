<script setup lang="ts">
/**
 * Tela reservada à conciliação futura de pagamentos da Point.
 * Não consulta credenciais, não apresenta transações fictícias e não processa cobranças.
 * A integração real depende do modelo e modo de operação do terminal Mercado Pago.
 */
</script>

<template>
  <div class="heading">
    <div>
      <p class="eyebrow">VALORA3D · FEIRAS E VENDAS</p>
      <h1>Maquininha</h1>
      <p>Acompanhe os recebimentos das feiras pela maquininha do Mercado Pago.</p>
    </div>
  </div>

  <div class="machine-status" role="status">
    <span class="machine-status-indicator" aria-hidden="true"></span>
    <div>
      <strong>Integração com o Mercado Pago ainda não conectada</strong>
      <p>Esta tela não recebe pagamentos automaticamente por enquanto. Não houve importação de vendas.</p>
    </div>
  </div>

  <div class="machine-meta">
    <section class="panel">
      <small>Origem dos recebimentos</small>
      <strong>Mercado Pago Point</strong>
    </section>
    <section class="panel">
      <small>Última sincronização</small>
      <strong>Ainda não realizada</strong>
    </section>
  </div>

  <section class="panel">
    <div class="panel-title">
      <div>
        <h2>Vendas registradas pela maquininha</h2>
        <p>Quando a conexão estiver validada, os pagamentos confirmados aparecerão aqui.</p>
      </div>
      <RouterLink class="secondary-action" to="/lancamentos">Lançamentos manuais</RouterLink>
    </div>
    <div class="scroll">
      <table aria-label="Vendas importadas do Mercado Pago">
        <thead>
          <tr><th>Data</th><th>Venda</th><th>Forma</th><th>Valor</th><th>Situação</th></tr>
        </thead>
        <tbody>
          <tr><td colspan="5" class="machine-empty">Nenhum recebimento sincronizado. Os valores aparecerão após conectar a conta e validar os avisos de pagamento.</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
