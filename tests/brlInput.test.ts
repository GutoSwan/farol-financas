import { describe, expect, it } from 'vitest'
import { formatBRLAsYouType, finishBRLInput } from '../src/presentation/utils/brlInput'
import { parseBRLToCents } from '../src/domain/value-objects/Money'

describe('Máscara de reais', () => {
  it('interpreta 500 como R$ 500,00, e não R$ 5,00', () => {
    expect(formatBRLAsYouType('500')).toBe('R$ 500')
    expect(finishBRLInput('500')).toContain('500,00')
    expect(parseBRLToCents(finishBRLInput('500'))).toBe(50000)
  })
  it('aceita centavos com vírgula', () => {
    expect(formatBRLAsYouType('500,5')).toBe('R$ 500,5')
    expect(finishBRLInput('500,5')).toContain('500,50')
  })
  it('adiciona separadores de milhar e permite começar do zero', () => {
    expect(formatBRLAsYouType('1234,56')).toBe('R$ 1.234,56')
    expect(formatBRLAsYouType('')).toBe('')
    expect(finishBRLInput('')).toBe('')
  })
})
