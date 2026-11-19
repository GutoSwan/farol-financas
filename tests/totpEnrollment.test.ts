import { describe, expect, it } from 'vitest'
import { allTotpFactors, isTotpCode, safeTotpQrImage, totpSetupAvailability } from '../src/domain/auth/totpEnrollment'

describe('Cadastro TOTP com falha segura', () => {
  it('inclui cadastros incompletos presentes somente em `all` do Supabase', () => {
    const factors = allTotpFactors([
      { id: 'pendente', factor_type: 'totp', status: 'unverified' },
      { id: 'outro', factor_type: 'phone', status: 'verified' },
    ])
    expect(factors).toEqual([{ id: 'pendente', factor_type: 'totp', status: 'unverified' }])
    expect(totpSetupAvailability(factors)).toBe('incomplete')
  })
  it('não considera fator não verificado como autenticador ativo', () => {
    expect(totpSetupAvailability([{ id: 'f1', status: 'unverified' }])).toBe('incomplete')
    expect(totpSetupAvailability([])).toBe('available')
    expect(totpSetupAvailability([{ id: 'f1', status: 'verified' }])).toBe('active')
    expect(totpSetupAvailability([{ id: 'f1', status: 'unverified' }, { id: 'f2', status: 'verified' }])).toBe('active')
  })

  it('aceita apenas um código de seis dígitos', () => {
    expect(isTotpCode('123456')).toBe(true)
    expect(isTotpCode(' 123456 ')).toBe(true)
    for (const invalid of ['12345', '1234567', 'abcdef', '12 3456', '１２３４５６', '']) {
      expect(isTotpCode(invalid)).toBe(false)
    }
  })

  it('aceita a imagem embutida do Supabase sem abrir recursos externos', () => {
    expect(safeTotpQrImage('data:image/svg+xml;utf-8,<svg/>')).toBe('data:image/svg+xml;utf-8,<svg/>')
    expect(safeTotpQrImage('data:image/svg+xml;base64,PHN2Zz4=')).toBe('data:image/svg+xml;base64,PHN2Zz4=')
    expect(safeTotpQrImage('data:image/png;base64,aGVsbG8=')).toBe('data:image/png;base64,aGVsbG8=')
    expect(safeTotpQrImage('https://example.org/image.svg')).toBeNull()
    expect(safeTotpQrImage('javascript:alert(1)')).toBeNull()
    expect(safeTotpQrImage('data:text/html,<script>bad</script>')).toBeNull()
    expect(safeTotpQrImage('data:image/svg+xml;base64,' + 'A'.repeat(150_001))).toBeNull()
  })
})
