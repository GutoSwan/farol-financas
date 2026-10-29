import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Proxy somente em desenvolvimento; o backend Fastify continua na porta 3333.
  server: { proxy: { '/api': { target: 'http://127.0.0.1:3333', changeOrigin: true } } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
