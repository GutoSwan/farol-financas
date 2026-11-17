import { describe, expect, it } from 'vitest'
import { recoveryMfaDecision } from '../src/domain/auth/recoveryMfaGate'

describe('Exigência de MFA na recuperação de senha', () => {
  it('solicita código quando a sessão está em AAL1 e a conta exige AAL2', () => {
    expect(recoveryMfaDecision({ currentLevel: 'aal1', nextLevel: 'aal2' })).toBe('required')
  })
  it('libera quando o autenticador já foi confirmado', () => {
    expect(recoveryMfaDecision({ currentLevel: 'aal2', nextLevel: 'aal2' })).toBe('ready')
  })
  it('não exige código de contas sem MFA', () => {
    expect(recoveryMfaDecision({ currentLevel: 'aal1', nextLevel: 'aal1' })).toBe('ready')
  })
  it('não libera uma sessão inválida ou não identificada', () => {
    expect(() => recoveryMfaDecision({ currentLevel: null, nextLevel: null })).toThrow()
  })
})
