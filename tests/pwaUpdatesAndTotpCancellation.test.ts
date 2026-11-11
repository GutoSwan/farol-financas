import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const serviceWorker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf-8')
const totpScreen = readFileSync(new URL('../src/presentation/components/TotpSettings.vue', import.meta.url), 'utf-8')

describe('PWA: atualizações sem cache antigo e sem dados financeiros', () => {
  it('migra o cache da versão anterior e remove caches antigos', () => {
    expect(serviceWorker).toContain("const CACHE = 'farol-static-v2'")
    expect(serviceWorker).toContain("keys.filter((key) => key.startsWith('farol-static-') && key !== CACHE)")
  })
  it('mantém páginas de navegação network-first e nunca cacheia APIs', () => {
    expect(serviceWorker).toContain("url.pathname.startsWith('/api/')")
    expect(serviceWorker).toContain("request.mode === 'navigate'")
    expect(serviceWorker).toContain("fetch(request)")
    expect(serviceWorker).toContain("cache.put('/', copy)")
  })
  it('usa cache-first apenas para assets versionados do Vite', () => {
    expect(serviceWorker).toContain("if (url.pathname.startsWith('/assets/'))")
    expect(serviceWorker).toContain("caches.match(request).then((cached) => cached || fetch(request)")
  })
  it('não entrega manifesto e ícones desatualizados quando estiver online', () => {
    const mutable = serviceWorker.indexOf("if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest')")
    const until = serviceWorker.slice(mutable)
    expect(mutable).toBeGreaterThan(-1)
    expect(until).toContain('fetch(request).then((response)')
    expect(until).toContain("catch(async () => (await caches.match(request)) || Response.error())")
    expect(until).not.toContain('caches.match(request).then((cached) => cached || fetch(request)')
  })
})

describe('Inscrição TOTP: estado só é descartado após confirmação', () => {
  it('mantém o QR na tela se o servidor não cancelar o fator', () => {
    expect(totpScreen).toContain('await discardUnverifiedTotpFactor(id)')
    expect(totpScreen.indexOf('await discardUnverifiedTotpFactor(id)')).toBeLessThan(totpScreen.indexOf('pending.value = null',totpScreen.indexOf('async function cancelEnrollment')))
    expect(totpScreen).toContain('errorText.value = safeError(error)')
  })
})
