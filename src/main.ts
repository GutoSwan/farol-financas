import { createApp } from 'vue'
import { Capacitor } from '@capacitor/core'
import App from './App.vue'
import router from './router'
import { initializeTheme } from './presentation/composables/useTheme'
import './assets/styles/global.css'
import './assets/styles/themes.css'
import './assets/styles/layout-improvements.css'
import './assets/styles/transactions.css'
import './assets/styles/finance-improvements.css'
import './assets/styles/v0.2.css'
import './assets/styles/budgets.css'
import './assets/styles/monthly-expenses.css'

initializeTheme()
createApp(App).use(router).mount('#app')

import './assets/styles/auth.css'
import './assets/styles/auth-redesign.css'
import './assets/styles/profile-otp.css'
import './assets/styles/online-auth.css'
import './assets/styles/sticky-sidebar.css'
import './assets/styles/sidebar-theme.css'
import './assets/styles/gifts.css'
import './assets/styles/calendar.css'
import './assets/styles/ux-admin-calendar.css'
import './assets/styles/security-mobile.css'


// Atualiza apenas os arquivos estáticos. Dados financeiros e autenticação
// nunca são interceptados ou armazenados pelo service worker.
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Falha no modo offline não impede o uso online do Farol.
    })
  })
}
