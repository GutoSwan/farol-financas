/**
 * O Supabase pode fornecer o QR TOTP como SVG puro ou data URI SVG.
 * Não re-encodar data URIs: isso produz uma imagem inválida.
 * O QR contém um SEGREDO: usar apenas na memória e nunca registrar em logs.
 */
export function totpQrImageSource(qrCode: string): string {
  const value = qrCode.trim()
  if (/^data:image\/svg\+xml(?:;(?:utf8|charset=utf-8|base64))*,/i.test(value)) {
    return value
  }
  if (/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(value) && /<\/svg>\s*$/i.test(value)) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(value)
  }
  return ''
}
