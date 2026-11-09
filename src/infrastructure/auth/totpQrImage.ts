/**
 * O Supabase pode fornecer o QR TOTP como SVG puro ou data URI SVG, incluindo
 * o prefixo não padronizado "data:image/svg+xml;utf-8,".
 *
 * Normalizar o SVG para data URI UTF-8 válida sem acessar serviços externos.
 * QR e segredo TOTP existem apenas na memória. Nunca enviar a logs ou analytics.
 */
export function totpQrImageSource(qrCode: string): string {
  const value = qrCode.trim()
  const mime = /^data:image\/svg\+xml((?:;(?:utf8|utf-8|charset=utf-8|base64))*)\s*,/i.exec(value)
  if (mime) {
    if (/;base64/i.test(mime[1])) return value

    // O SDK do Supabase entrega às vezes "utf-8" sem "charset=".
    // Canonicalizar tanto payload SVG literal quanto já percent-encoded.
    const encodedPayload = value.slice(mime[0].length)
    try {
      const svg = decodeURIComponent(encodedPayload).trim()
      if (/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(svg) && /<\/svg>\s*$/i.test(svg)) {
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
      }
    } catch {
      return ''
    }
    return ''
  }

  if (/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(value) && /<\/svg>\s*$/i.test(value)) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(value)
  }
  return ''
}
