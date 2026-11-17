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

  it('exige pelo menos 8 caracteres e permite frases com espaços e caracteres especiais', () => {
    expect(MIN_NEW_PASSWORD_LENGTH).toBe(8)
    expect(() => validateNewPassword('curta')).toThrow('pelo menos 8')
    expect(() => validateNewPassword('🔒'.repeat(8))).not.toThrow()
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
    await expect(assertPasswordNotLeaked('1234567')).rejects.toThrow('pelo menos 8')
    expect(mock).not.toHaveBeenCalled()
  })
})
