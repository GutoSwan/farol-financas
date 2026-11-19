import * as QRCode from 'qrcode'
import { safeTotpQrImage } from '../../domain/auth/totpEnrollment'

type TotpQrInput = {
  secret: string
  uri?: unknown
  serverQr?: unknown
  accountLabel: string
}

/**
 * O QR é gerado no navegador: nunca enviamos o segredo TOTP a um serviço de QR externo.
 * Antes de reutilizar o URI fornecido pelo Auth, conferimos que ele contém exatamente
 * o mesmo segredo recebido para o fator que está sendo cadastrado.
 */
export function trustedTotpUri(input: TotpQrInput): string | null {
  const secret = input.secret.trim().toUpperCase()
  if (!/^[A-Z2-7]{16,128}={0,6}$/.test(secret)) return null

  if (typeof input.uri === 'string' && input.uri.length <= 2_048) {
    try {
      const parsed = new URL(input.uri)
      if (parsed.protocol === 'otpauth:' && parsed.hostname === 'totp' &&
          parsed.pathname.length > 1 && !parsed.hash && !parsed.username && !parsed.password &&
          parsed.searchParams.getAll('secret').length === 1 &&
          parsed.searchParams.get('secret')?.toUpperCase() === secret) {
        return input.uri
      }
    } catch { /* Usa um URI próprio se a resposta do servidor não for válida. */ }
  }

  const label = `Farol Finanças:${input.accountLabel.slice(0, 100) || 'Conta'}`
  const uri = new URL(`otpauth://totp/${encodeURIComponent(label)}`)
  uri.searchParams.set('secret', secret)
  uri.searchParams.set('issuer', 'Farol Finanças')
  uri.searchParams.set('algorithm', 'SHA1')
  uri.searchParams.set('digits', '6')
  uri.searchParams.set('period', '30')
  return uri.toString()
}

/** Gera um SVG exclusivamente local. A imagem original do Supabase é só fallback. */
export async function createTotpQrImage(input: TotpQrInput): Promise<string | null> {
  const uri = trustedTotpUri(input)
  if (uri) {
    try {
      const svg = await QRCode.toString(uri, {
        type: 'svg', width: 208, margin: 2, errorCorrectionLevel: 'M',
      })
      const generated = safeTotpQrImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
      if (generated) return generated
    } catch { /* Mantém a opção de cadastrar pela chave manual. */ }
  }
  return safeTotpQrImage(input.serverQr)
}
