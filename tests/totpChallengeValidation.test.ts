import { beforeEach, describe, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ challenge: vi.fn(), verify: vi.fn() }))
vi.mock('../src/infrastructure/auth/supabase', () => ({
  supabase: { auth: { mfa: { challenge: fake.challenge, verify: fake.verify } } },
}))
import { verifyTotpCode } from '../src/infrastructure/auth/totpMfa'
const factorId = '11111111-1111-4111-8111-111111111111'
describe('Verificação de código de autenticador',()=>{
  beforeEach(()=>{
    vi.resetAllMocks()
    fake.challenge.mockResolvedValue({ data: { id: 'challenge-id' }, error: null })
    fake.verify.mockResolvedValue({ data: { id: 'verified' }, error: null })
  })
  it('rejeita código inválido antes de criar um desafio remoto',async()=>{
    await expect(verifyTotpCode(factorId,'12a')).rejects.toThrow(/seis dígitos/)
    expect(fake.challenge).not.toHaveBeenCalled()
    expect(fake.verify).not.toHaveBeenCalled()
  })
  it('rejeita ID de dispositivo inválido antes de criar desafio',async()=>{
    await expect(verifyTotpCode('factor-errado','123456')).rejects.toThrow(/inválido/)
    expect(fake.challenge).not.toHaveBeenCalled()
  })
  it('envia código normalizado apenas após challenge emitido pelo servidor',async()=>{
    await verifyTotpCode(factorId, ' 123 456 ')
    expect(fake.challenge).toHaveBeenCalledWith({ factorId })
    expect(fake.verify).toHaveBeenCalledWith({ factorId, challengeId: 'challenge-id', code: '123456' })
  })
  it('não considera código verificado se o Supabase rejeitar',async()=>{
    fake.verify.mockResolvedValue({ data: null, error: { message: 'expired' } })
    await expect(verifyTotpCode(factorId,'123456')).rejects.toThrow(/inválido ou expirado/)
  })
})
