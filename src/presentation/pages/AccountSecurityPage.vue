<script setup lang="ts">
import BackNavigation from '../components/BackNavigation.vue'
import UiIcon from '../components/UiIcon.vue'
import TotpSettings from '../components/TotpSettings.vue'
import PhoneLinkPanel from '../components/PhoneLinkPanel.vue'
</script>

<template>
  <div class="account-security-page">
    <BackNavigation fallback="/conta" />

    <header class="security-hero">
      <div class="security-hero-icon" aria-hidden="true">
        <UiIcon name="shield-check" :size="31" />
      </div>
      <div class="security-hero-content">
        <p class="security-eyebrow">SUA CONTA, PROTEGIDA</p>
        <h1>Segurança e acesso</h1>
        <p class="security-hero-description">
          Controle como você entra no Farol e quais dispositivos podem confirmar sua identidade.
        </p>
        <div class="security-hero-highlights" aria-label="Métodos de proteção">
          <span><UiIcon name="check" :size="14" /> Verificação em duas etapas</span>
          <span><UiIcon name="shield-check" :size="14" /> Proteção dos seus dados</span>
        </div>
      </div>
    </header>

    <div class="security-section-grid">
      <section class="security-surface security-surface-primary" aria-label="Autenticadores">
        <div class="security-section-label">
          <div class="security-section-symbol" aria-hidden="true"><UiIcon name="shield-check" :size="21" /></div>
          <div>
            <span class="security-step">01 · SEGURANÇA PRINCIPAL</span>
            <p>Configure, substitua ou remova seus autenticadores com segurança.</p>
          </div>
        </div>
        <TotpSettings />
      </section>

      <section class="security-surface security-surface-secondary" aria-label="Celular e recuperação">
        <div class="security-section-label">
          <div class="security-section-symbol security-section-symbol-phone" aria-hidden="true">
            <UiIcon name="smartphone" :size="21" />
          </div>
          <div>
            <span class="security-step">02 · ACESSO ADICIONAL</span>
            <p>Um número para acesso e recuperação, quando o recurso estiver disponível.</p>
          </div>
        </div>
        <PhoneLinkPanel />
        <div class="security-tip">
          <UiIcon name="info" :size="18" />
          <p><strong>Importante:</strong> SMS não substitui seu aplicativo autenticador. Guarde um segundo autenticador de reserva.</p>
        </div>
      </section>
    </div>

    <p class="security-footer-note">
      <UiIcon name="shield-check" :size="16" />
      As alterações de segurança são verificadas pelo servidor. Seus códigos nunca devem ser compartilhados.
    </p>
  </div>
</template>
