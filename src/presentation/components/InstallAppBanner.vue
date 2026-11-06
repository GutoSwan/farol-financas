<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { Capacitor } from '@capacitor/core'

interface InstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'farol-install-banner-dismissed-v1'
const isMobile = ref(false)
const isIOS = ref(false)
const isStandalone = ref(false)
const dismissed = ref(false)
const showingInstructions = ref(false)
const promptEvent = shallowRef<InstallPrompt | null>(null)
const visible = computed(() => isMobile.value && !isStandalone.value && !dismissed.value)

function refreshPlatform(): void {
  const agent = navigator.userAgent
  isIOS.value = /iPad|iPhone|iPod/i.test(agent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  isMobile.value = isIOS.value || /Android/i.test(agent)
  const appleNavigator = navigator as Navigator & { standalone?: boolean }
  isStandalone.value = Capacitor.isNativePlatform() || window.matchMedia('(display-mode: standalone)').matches ||
    appleNavigator.standalone === true
}

function beforeInstallPrompt(event: Event): void {
  event.preventDefault()
  promptEvent.value = event as InstallPrompt
}

function installed(): void {
  isStandalone.value = true
  promptEvent.value = null
}

async function install(): Promise<void> {
  if (!promptEvent.value) {
    showingInstructions.value = true
    return
  }
  const pending = promptEvent.value
  await pending.prompt()
  const result = await pending.userChoice
  promptEvent.value = null
  if (result.outcome !== 'accepted') showingInstructions.value = true
}

function dismiss(): void {
  dismissed.value = true
  try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* navegação privada */ }
}

onMounted(() => {
  refreshPlatform()
  try { dismissed.value = localStorage.getItem(DISMISS_KEY) === '1' } catch { /* navegação privada */ }
  window.addEventListener('beforeinstallprompt', beforeInstallPrompt)
  window.addEventListener('appinstalled', installed)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', beforeInstallPrompt)
  window.removeEventListener('appinstalled', installed)
})
</script>

<template>
  <aside v-if="visible" class="install-banner" aria-label="Instalar aplicativo Farol Finanças">
    <div class="install-banner-main">
      <img src="/icons/icon-192.png" width="40" height="40" alt="" />
      <div class="install-banner-copy">
        <strong>Farol no seu celular</strong>
        <span>Adicione à tela inicial para abrir como aplicativo.</span>
      </div>
      <button class="install-banner-action" type="button" @click="install">
        {{ promptEvent ? 'Instalar' : 'Como instalar' }}
      </button>
      <button class="install-banner-dismiss" type="button" aria-label="Dispensar sugestão de instalação"
        @click="dismiss">×</button>
    </div>
    <div v-if="showingInstructions" class="install-banner-instructions" role="status">
      <template v-if="isIOS">
        Abra pelo <strong>Safari</strong>, toque em <strong>Compartilhar</strong> e selecione
        <strong>Adicionar à Tela de Início</strong>. Ative <strong>Abrir como App</strong>, se aparecer.
      </template>
      <template v-else>
        Abra pelo <strong>Chrome</strong>, toque no menu <strong>⋮</strong> e escolha
        <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.
      </template>
      <p>Os dados financeiros ainda são locais de cada navegador ou instalação. A sincronização virá em outra etapa.</p>
    </div>
  </aside>
</template>

<style scoped>
.install-banner {
  display: none;
  position: fixed;
  inset-inline: 12px;
  bottom: calc(12px + env(safe-area-inset-bottom));
  z-index: 15;
  max-width: 520px;
  margin: 0 auto;
  border-radius: 16px;
  border: 1px solid rgba(137, 79, 101, .18);
  background: #fffafc;
  color: #332437;
  box-shadow: 0 10px 32px rgba(25, 17, 35, .22);
  padding: 12px;
  font-family: Inter, 'Segoe UI', Arial, sans-serif;
}
.install-banner-main { display: flex; align-items: center; gap: 9px; }
.install-banner-main img { flex: none; border-radius: 10px; }
.install-banner-copy { display: grid; gap: 3px; flex: 1; min-width: 0; }
.install-banner-copy strong { font-size: 12px; }
.install-banner-copy span { font-size: 10px; line-height: 1.4; color: #6a5362; }
.install-banner-action {
  border: 0; border-radius: 9px; min-height: 40px; padding: 8px 10px;
  background: #833954; color: white; font-size: 11px; font-weight: 750;
  white-space: nowrap; cursor: pointer;
}
.install-banner-dismiss {
  border: 0; background: none; color: #6a5362; padding: 0 3px;
  width: 24px; min-width: 24px; min-height: 40px; font-size: 20px;
}
.install-banner-instructions {
  border-top: 1px solid #e6dce2; margin-top: 11px; padding: 11px 4px 2px;
  font-size: 12px; line-height: 1.6;
}
.install-banner-instructions p { font-size: 11px; margin: 8px 0 0; color: #715a65; }
@media (max-width: 767px) { .install-banner { display: block; } }
@media (max-width: 380px) {
  .install-banner { padding: 9px; }
  .install-banner-main { gap: 6px; }
  .install-banner-action { max-width: 94px; white-space: normal; }
}
:root[data-theme="dark"] .install-banner {
  background: #263248; color: #f6edf2; border-color: #73536d;
}
:root[data-theme="dark"] .install-banner-copy span,
:root[data-theme="dark"] .install-banner-dismiss,
:root[data-theme="dark"] .install-banner-instructions p { color: #d0c4ce; }
:root[data-theme="dark"] .install-banner-instructions { border-color: #4d4c60; }
</style>
