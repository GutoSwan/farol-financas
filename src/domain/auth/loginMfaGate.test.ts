import { describe, expect, it } from 'vitest'
import { loginMfaStatus } from './loginMfaGate'

describe('Portão MFA do login normal', () => {
  it('exige verificação quando existe fator configurado e token AAL1', () => {
    expect(loginMfaStatus('aal1', 'aal2')).toBe('required')
  })
  it('libera usuário sem fator e usuário com AAL2 já verificado', () => {
    expect(loginMfaStatus('aal1', 'aal1')).toBe('ready')
    expect(loginMfaStatus('aal2', 'aal2')).toBe('ready')
    expect(loginMfaStatus('aal2', 'aal1')).toBe('ready')
  })
  it('nega estados indefinidos até confirmar identidade', () => {
    expect(loginMfaStatus(null, null)).toBe('error')
    expect(loginMfaStatus('aal1', null)).toBe('error')
  })
})
