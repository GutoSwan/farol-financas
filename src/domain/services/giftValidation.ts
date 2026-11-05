import { assertMoney } from '../value-objects/Money'
import type { GiftInput, GiftPriority } from '../entities/Gift'

/** Um endereço de compra nunca pode executar JavaScript nem usar outras URLs especiais. */
export function normalizeGiftUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.length > 2048 || /\s/.test(trimmed)) {
    throw new Error('Informe um link de compra válido, sem espaços.')
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error('O link precisa começar com http:// ou https://.')
  }
  const source = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed
  try {
    const url = new URL(source)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') ||
      url.username || url.password) throw new Error('url')
    return url.href
  } catch {
    throw new Error('Informe um link de compra válido, como https://www.loja.com.br/produto.')
  }
}

export function normalizeGiftInput(input: GiftInput): GiftInput {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 120) {
    throw new Error('O presente precisa ter um nome de 2 a 120 caracteres.')
  }
  assertMoney(input.priceCents)
  if (!(['high', 'medium', 'low'] as GiftPriority[]).includes(input.priority)) {
    throw new Error('Selecione quanto deseja este presente.')
  }
  return {
    name,
    priceCents: input.priceCents,
    productUrl: normalizeGiftUrl(input.productUrl),
    priority: input.priority,
  }
}
