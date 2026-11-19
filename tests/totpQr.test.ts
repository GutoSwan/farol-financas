import { describe, expect, it } from 'vitest'
import { createTotpQrImage, trustedTotpUri } from '../src/infrastructure/auth/totpQr'

const secret = 'JBSWY3DPEHPK3PXP'
const validUri = `otpauth://totp/Farol%20Finan%C3%A7as%3ATeste?secret=${secret}&issuer=Farol%20Finan%C3%A7as`

describe('QR TOTP gerado no próprio dispositivo', () => {
  it('preserva o URI autêntico do fator quando o segredo confere', () => {
    expect(trustedTotpUri({ secret, uri: validUri, accountLabel: 'Teste' })).toBe(validUri)
  })

  it('reconstrói um URI seguro se o Supabase não enviar QR ou URI', async () => {
    const generatedUri = trustedTotpUri({ secret, accountLabel: 'Teste' })
    expect(generatedUri).not.toBeNull()
    const parsed = new URL(generatedUri!)
    expect(parsed.protocol).toBe('otpauth:')
    expect(parsed.hostname).toBe('totp')
    expect(parsed.searchParams.get('secret')).toBe(secret)
    expect(parsed.searchParams.get('issuer')).toBe('Farol Finanças')

    const image = await createTotpQrImage({ secret, accountLabel: 'Teste' })
    expect(image).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
    const svg = decodeURIComponent(image!.split(',')[1]!)
    expect(svg).toContain('<svg')
    expect(svg).toContain('<path')
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).not.toMatch(/<(?:script|image|foreignObject)\b/i)
    expect(svg).not.toMatch(/(?:xlink:)?href=/i)
  })

  it('ignora URIs externos ou com outro segredo', () => {
    for (const uri of [
      'https://example.com/collect?secret=' + secret,
      `otpauth://totp/OutraConta?secret=AAAAAAAAAAAAAAAA`,
      `otpauth://totp/Teste?secret=${secret}&secret=${secret}`,
    ]) {
      const safe = trustedTotpUri({ secret, uri, accountLabel: 'Teste' })!
      expect(safe).not.toBe(uri)
      expect(new URL(safe).searchParams.get('secret')).toBe(secret)
    }
  })

  it('não aceita chaves inválidas e nunca carrega uma URL externa como imagem', async () => {
    expect(trustedTotpUri({ secret: 'xyz!', uri: validUri, accountLabel: 'Teste' })).toBeNull()
    expect(await createTotpQrImage({ secret: 'xyz!', serverQr: 'https://example.com/qr.png', accountLabel: 'Teste' })).toBeNull()
  })
})
