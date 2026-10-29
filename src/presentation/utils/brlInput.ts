import { formatBRL, parseBRLToCents } from '../../domain/value-objects/Money'

/**
 * Formata enquanto digita sem dividir os algarismos por 100:
 * "500" -> "R$ 500"; "500,5" -> "R$ 500,5".
 * Ao perder o foco, o valor vira "R$ 500,00" ou "R$ 500,50".
 */
export function formatBRLAsYouType(raw: string): string {
  const cleaned = raw.replace(/^\s*R\$\s*/i, '').replace(/\s/g, '')
  const [integerPart, ...fractions] = cleaned.split(',')
  const digits = integerPart.replace(/\D/g, '').slice(0, 13)
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const hadComma = fractions.length > 0
  const fraction = fractions.join('').replace(/\D/g, '').slice(0, 2)
  if (!digits) return ''
  return `R$ ${grouped}${hadComma ? ',' + fraction : ''}`
}

export function finishBRLInput(raw: string): string {
  const text = formatBRLAsYouType(raw)
  if (!text) return ''
  // "R$ 500," deve ficar "R$ 500,00" ao sair do campo.
  return formatBRL(parseBRLToCents(text.endsWith(',') ? text.slice(0, -1) : text))
}
