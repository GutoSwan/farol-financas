import type { CapacitorConfig } from '@capacitor/cli'

// Bundle ID provisório: revisar antes de publicar nas lojas.
const config: CapacitorConfig = {
  appId: 'com.farolfinancas.app',
  appName: 'Farol Finanças',
  webDir: 'dist',
  server: { androidScheme: 'https', hostname: 'localhost' },
}

export default config
