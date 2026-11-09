import { describe, expect, it } from 'vitest'
import { totpQrImageSource } from '../src/infrastructure/auth/totpQrImage'

const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" /></svg>'
const canonical = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rawSvg)

describe('QR Code TOTP recebido do Supabase', () => {
  it('reconhece o prefixo não padronizado ;utf-8, que o Supabase retorna', () => {
    expect(totpQrImageSource('data:image/svg+xml;utf-8,' + rawSvg)).toBe(canonical)
  })

  it('reconhece ;utf-8, também com conteúdo percent-encoded', () => {
    expect(totpQrImageSource('data:image/svg+xml;utf-8,' + encodeURIComponent(rawSvg))).toBe(canonical)
  })

  it('normaliza uri SVG ;utf8 e ;charset=utf-8 sem dupla codificação', () => {
    expect(totpQrImageSource('data:image/svg+xml;utf8,' + encodeURIComponent(rawSvg))).toBe(canonical)
    expect(totpQrImageSource('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rawSvg))).toBe(canonical)
  })

  it('preserva uri SVG base64 e aceita SVG puro', () => {
    const b64 = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
    expect(totpQrImageSource(b64)).toBe(b64)
    expect(totpQrImageSource(rawSvg)).toBe(canonical)
  })

  it('não permite URLs remotas ou protocolos desconhecidos', () => {
    expect(totpQrImageSource('https://example.com/qr.svg')).toBe('')
    expect(totpQrImageSource('javascript:alert(1)')).toBe('')
    expect(totpQrImageSource('<script>alert(1)</script>')).toBe('')
    expect(totpQrImageSource('data:text/html,<svg></svg>')).toBe('')
  })

  it('não aceita URI SVG com percent-encoding inválido', () => {
    expect(totpQrImageSource('data:image/svg+xml;utf-8,%XX')).toBe('')
  })
})
