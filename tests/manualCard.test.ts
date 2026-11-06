import { describe, expect, it } from 'vitest'
import { parseManualCardDraft, parseManualCardExpenseDraft } from '../src/domain/entities/ManualCard'

describe('Cartões apenas visuais e manuais', () => {
  it('aceita informações de exibição, sem conexão bancária', () => {
    expect(parseManualCardDraft({
      kind: 'credit', nickname: 'Compras', institution: 'Banco exemplo',
      limitCents: 300000, closingDay: 12, dueDay: 20,
    })).toMatchObject({ kind: 'credit', limitCents: 300000 })
    expect(parseManualCardDraft({
      kind: 'debit', nickname: 'Conta do dia a dia', institution: 'Banco exemplo',
      balanceCents: 12500,
    })).toMatchObject({ kind: 'debit', balanceCents: 12500 })
  })

  it.each(['cardNumber', 'pan', 'cvv', 'cvc', 'pin', 'password', 'bankToken', 'expiry'])(
    'rejeita o campo proibido %s mesmo quando outras informações são válidas',
    (field) => {
      expect(() => parseManualCardDraft({
        kind: 'credit', nickname: 'Compras', institution: 'Banco exemplo',
        limitCents: 300000, closingDay: 12, dueDay: 20, [field]: '123',
      })).toThrow('campos não permitidos')
    },
  )

  it('rejeita dados automáticos e campos desconhecidos nas despesas', () => {
    const draft = { cardId: 'card-1', description: 'Mercado', amountCents: 12900, occurredOn: '2026-11-06' }
    expect(parseManualCardExpenseDraft(draft)).toEqual(draft)
    expect(() => parseManualCardExpenseDraft({ ...draft, accessToken: 'secret' })).toThrow('campos não permitidos')
    expect(() => parseManualCardDraft({
      kind: 'debit', nickname: 'Dia a dia', institution: 'Exemplo', balanceCents: -1,
    })).toThrow('valor monetário')
  })
})
