import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertPasswordNotLeaked,
  LeakedPasswordError,
  MIN_NEW_PASSWORD_LENGTH,
  validateNewPassword,
} from '../src/domain/auth/passwordSafety'

afterEach(() => vi.unstubAllGlobals())

describe('Proteção gratuita de senhas novas', () => {
  const candidate = 'frase exclusiva de teste 2026!'

  it('exige senha longa, mas permite frases com espaços e caracteres especiais', () => {
    expect(MIN_NEW_PASSWORD_LENGTH).toBe(12)
    expect(() => validateNewPassword('curtinha')).toThrow('pelo menos 12')
    expect(() => validateNewPassword('🔒'.repeat(5))).toThrow('pelo menos 12')
    expect(() => validateNewPassword('á'.repeat(40))).toThrow('72 bytes')
    expect(() => validateNewPassword(candidate)).not.toThrow()
  })

  async function digestSuffix(): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(candidate))
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0'))
      .join('').toUpperCase().slice(5)
  }

  it('rejeita senha vazada; consulta somente cinco caracteres do hash, sem credenciais', async () => {
    const suffix = await digestSuffix()
    const mock = vi.fn().mockResolvedValue(new Response(`${suffix}:999\r\n`, { status: 200 }))
    vi.stubGlobal('fetch', mock)

    await expect(assertPasswordNotLeaked(candidate)).rejects.toBeInstanceOf(LeakedPasswordError)
    expect(mock).toHaveBeenCalledOnce()
    const [url, options] = mock.mock.calls[0]
    expect(url).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[A-F0-9]{5}$/)
    expect(url).not.toContain(candidate)
    expect(options).toMatchObject({
      method: 'GET', headers: { 'Add-Padding': 'true' }, credentials: 'omit',
      referrerPolicy: 'no-referrer', cache: 'no-store',
    })
  })

  it('ignora resultados diferentes e entradas artificiais com contagem zero', async () => {
    const suffix = await digestSuffix()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(`${suffix}:0\r\n${'A'.repeat(35)}:50\r\n`, { status: 200 }),
    ))
    await expect(assertPasswordNotLeaked(candidate)).resolves.toBeUndefined()
  })

  it('bloqueia redefinição se a consulta externa estiver indisponível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')))
    await expect(assertPasswordNotLeaked(candidate)).rejects.toThrow('Não foi possível verificar')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
    await expect(assertPasswordNotLeaked(candidate)).rejects.toThrow('Não foi possível verificar')
  })

  it('não consulta serviços externos quando a senha não cumpre o comprimento mínimo', async () => {
    const mock = vi.fn()
    vi.stubGlobal('fetch', mock)
    await expect(assertPasswordNotLeaked('123456789')).rejects.toThrow('pelo menos 12')
    expect(mock).not.toHaveBeenCalled()
  })
})
