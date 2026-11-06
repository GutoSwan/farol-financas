/**
 * Modelo de cartões APENAS VISUAL, informado manualmente pelo usuário.
 * NÃO contém número do cartão, data de validade, CVV, PIN, agência, conta ou token.
 * Nenhuma integração bancária ou de pagamento é permitida neste módulo.
 */
export type ManualCardDraft =
  | { kind: 'credit'; nickname: string; institution: string; limitCents: number; closingDay: number; dueDay: number }
  | { kind: 'debit'; nickname: string; institution: string; balanceCents: number }

export interface ManualCardExpenseDraft {
  cardId: string
  description: string
  amountCents: number
  occurredOn: string
}

const MAX_CENTS = 9_999_999_999

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function onlyKeys(obj: Record<string, unknown>, keys: string[]) {
  if (Object.keys(obj).some((key) => !keys.includes(key))) {
    throw new Error('O formulário contém campos não permitidos. Não informe números ou credenciais do cartão.')
  }
}

function label(value: unknown, maximum: number): string {
  if (typeof value !== 'string') throw new Error('Informe uma descrição válida.')
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed || trimmed.length > maximum) throw new Error('Descrição fora do limite permitido.')
  return trimmed
}

function cents(value: unknown): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 0 || value > MAX_CENTS) {
    throw new Error('Informe um valor monetário válido em centavos.')
  }
  return value
}

function day(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 31) {
    throw new Error('Informe um dia entre 1 e 31.')
  }
  return value
}

export function parseManualCardDraft(value: unknown): ManualCardDraft {
  if (!isRecord(value)) throw new Error('Cartão inválido.')
  if (value.kind === 'credit') {
    onlyKeys(value, ['kind', 'nickname', 'institution', 'limitCents', 'closingDay', 'dueDay'])
    return {
      kind: 'credit',
      nickname: label(value.nickname, 60),
      institution: label(value.institution, 60),
      limitCents: cents(value.limitCents),
      closingDay: day(value.closingDay),
      dueDay: day(value.dueDay),
    }
  }
  if (value.kind === 'debit') {
    onlyKeys(value, ['kind', 'nickname', 'institution', 'balanceCents'])
    return {
      kind: 'debit',
      nickname: label(value.nickname, 60),
      institution: label(value.institution, 60),
      balanceCents: cents(value.balanceCents),
    }
  }
  throw new Error('Tipo de cartão inválido.')
}

export function parseManualCardExpenseDraft(value: unknown): ManualCardExpenseDraft {
  if (!isRecord(value)) throw new Error('Despesa inválida.')
  onlyKeys(value, ['cardId', 'description', 'amountCents', 'occurredOn'])
  const cardId = label(value.cardId, 90)
  if (!/^[a-zA-Z0-9-]+$/.test(cardId)) throw new Error('Identificador do cartão inválido.')
  const occurredOn = label(value.occurredOn, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) || Number.isNaN(Date.parse(occurredOn))) {
    throw new Error('Data da despesa inválida.')
  }
  return {
    cardId,
    description: label(value.description, 120),
    amountCents: cents(value.amountCents),
    occurredOn,
  }
}
