import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './assets/styles/global.css'
import './assets/styles/themes.css'
import './assets/styles/layout-improvements.css'
import './assets/styles/transactions.css'
import './assets/styles/finance-improvements.css'

createApp(App).use(router).mount('#app')
