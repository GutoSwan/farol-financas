import { describe, expect, it } from 'vitest'
import { resolveApiBaseUrl } from '../src/infrastructure/api/apiEndpoint'

describe('Endereço da API hospedada', () => {
  it('usa proxy local apenas no ambiente de desenvolvimento', () => {
    expect(resolveApiBaseUrl('', true)).toBe('')
    expect(resolveApiBaseUrl('', false)).toBe(null)
  })
  it('aceita HTTPS da Vercel, com ou sem barra final', () => {
    expect(resolveApiBaseUrl(' https://farol-api.vercel.app/ ', false))
      .toBe('https://farol-api.vercel.app')
  })
  it('rejeita URL insegura ou que carregue credenciais e caminhos extras', () => {
    for (const raw of [
      'http://farol-api.vercel.app', 'https://user:senha@farol-api.vercel.app',
      'https://farol-api.vercel.app/private', 'javascript:alert(1)',
      'https://farol-api.vercel.app/?token=123', 'https://farol-api.vercel.app/#segredo',
    ]) {
      expect(resolveApiBaseUrl(raw, false)).toBe(null)
    }
  })
})
