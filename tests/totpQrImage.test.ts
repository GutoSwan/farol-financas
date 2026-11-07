import { describe, expect, it } from 'vitest'
import { totpQrImageSource } from '../src/infrastructure/auth/totpQrImage'

describe('QR Code do autenticador Supabase', () => {
  it('usa data URI SVG já fornecida pela API sem codificar novamente', () => {
    const qr = 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E'
    expect(totpQrImageSource(qr)).toBe(qr)
  })
  it('aceita URI SVG com charset ou base64', () => {
    const utf = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E'
    const b64 = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
    expect(totpQrImageSource(utf)).toBe(utf)
    expect(totpQrImageSource(b64)).toBe(b64)
  })
  it('converte um SVG puro para URI segura de imagem', () => {
    const raw = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" /></svg>'
    const uri = totpQrImageSource(raw)
    expect(uri).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
    expect(decodeURIComponent(uri.split(',')[1])).toBe(raw)
  })
  it('rejeita URL externa e outros protocolos', () => {
    expect(totpQrImageSource('https://example.com/qr.svg')).toBe('')
    expect(totpQrImageSource('javascript:alert(1)')).toBe('')
    expect(totpQrImageSource('<script>alert(1)</script>')).toBe('')
  })
})
