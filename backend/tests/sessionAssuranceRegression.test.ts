import { describe, expect, it, vi } from 'vitest'
import { validateSignedSessionClaims } from '../src/infrastructure/auth/SupabaseJwtVerifier.js'

const userId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const claims = { sub: userId, session_id: sessionId, role: 'authenticated', aal: 'aal2' }

describe('Regressão de autenticação Supabase: sessão autenticada e MFA', () => {
  it('aceita somente sessão ativa e preserva AAL2 validado', async () => {
    const active = vi.fn(async () => ({ active: true, mfaRequired: false }))
    expect(await validateSignedSessionClaims(claims, active)).toEqual({
      userId, assuranceLevel: 'aal2', mfaRequired: false,
    })
    expect(active).toHaveBeenCalledTimes(1)
    expect(active).toHaveBeenCalledWith(userId, sessionId)
  })

  it('rejeita sessão revogada mesmo se o JWT já tiver assinatura válida', async () => {
    const inactive = vi.fn(async () => ({ active: false, mfaRequired: false }))
    await expect(validateSignedSessionClaims(claims, inactive))
      .rejects.toThrow('Sessão revogada ou expirada')
    expect(inactive).toHaveBeenCalledWith(userId, sessionId)
  })

  it('falha fechada quando o banco não consegue verificar a sessão', async () => {
    const failure = vi.fn(async () => { throw new Error('DB offline') })
    await expect(validateSignedSessionClaims(claims, failure)).rejects.toThrow('DB offline')
  })

  it('não permite promover AAL1 ou AAL desconhecido a AAL2', async () => {
    const active = async () => ({ active: true, mfaRequired: false })
    expect((await validateSignedSessionClaims({ ...claims, aal: 'aal1' }, active)).assuranceLevel).toBe('aal1')
    expect((await validateSignedSessionClaims({ ...claims, aal: 'unknown' }, active)).assuranceLevel).toBe('aal1')
    expect((await validateSignedSessionClaims({ ...claims, aal: undefined }, active)).assuranceLevel).toBe('aal1')
  })

  it('conserva a exigência de TOTP consultada no banco, sem confiar no JWT para essa decisão', async () => {
    const active = async () => ({ active: true, mfaRequired: true })
    expect(await validateSignedSessionClaims({ ...claims, aal: 'aal1' }, active)).toEqual({
      userId, assuranceLevel: 'aal1', mfaRequired: true,
    })
    const withoutFactor = async () => ({ active: true, mfaRequired: false })
    expect(await validateSignedSessionClaims({ ...claims, aal: 'aal1' }, withoutFactor)).toEqual({
      userId, assuranceLevel: 'aal1', mfaRequired: false,
    })
    const revoked = async () => ({ active: false, mfaRequired: true })
    await expect(validateSignedSessionClaims(claims, revoked)).rejects.toThrow('Sessão revogada')
  })

  it('rejeita contas anônimas, outras roles e sessão inválida antes de acessar o banco', async () => {
    const check = vi.fn(async () => ({ active: true, mfaRequired: false }))
    for (const invalid of [
      { ...claims, is_anonymous: true },
      { ...claims, role: 'service_role' },
      { ...claims, role: 'anon' },
      { ...claims, session_id: 'wrong-session' },
      { ...claims, session_id: undefined },
      { ...claims, sub: 'wrong-user' },
      { ...claims, sub: undefined },
    ]) {
      await expect(validateSignedSessionClaims(invalid, check)).rejects.toThrow('Token inválido')
    }
    expect(check).not.toHaveBeenCalled()
  })

  it('uma identidade não pode validar a sessão de outra pessoa pelo ID declarado', async () => {
    const belongingToAnotherUser = async (subject: string, session: string) => ({
      active: subject === userId && session === '33333333-3333-4333-8333-333333333333',
      mfaRequired: false,
    })
    await expect(validateSignedSessionClaims(claims, belongingToAnotherUser))
      .rejects.toThrow('Sessão revogada ou expirada')
  })
})
