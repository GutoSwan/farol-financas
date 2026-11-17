import { describe, expect, it, vi } from 'vitest'
import { validateSignedSessionClaims } from '../src/infrastructure/auth/SupabaseJwtVerifier.js'

const userId = '123e4567-e89b-42d3-a456-426614174000'
const sessionId = '3e8f59da-6855-45e3-af64-49f7e77a8855'
const claims = { sub: userId, session_id: sessionId, role: 'authenticated', aal: 'aal2', is_anonymous: false }

describe('Verificação de sessão Supabase ativa', () => {
  it('aceita somente uma sessão confirmada pelo servidor', async () => {
    const check = vi.fn().mockResolvedValue({ active: true, mfaRequired: false })
    await expect(validateSignedSessionClaims(claims, check)).resolves.toEqual({
      userId, assuranceLevel: 'aal2', mfaRequired: false,
    })
    expect(check).toHaveBeenCalledExactlyOnceWith(userId, sessionId)
  })

  it('nega token assinado de uma sessão removida', async () => {
    await expect(validateSignedSessionClaims(claims, async () => ({ active: false, mfaRequired: false }))).rejects.toThrow('Sessão revogada')
  })

  it('nega sessão se o banco estiver indisponível', async () => {
    await expect(validateSignedSessionClaims(claims, async () => {
      throw new Error('database unavailable')
    })).rejects.toThrow('database unavailable')
  })

  it('nega claims de sessão ausentes ou inválidos sem consultar banco', async () => {
    const check = vi.fn().mockResolvedValue({ active: true, mfaRequired: false })
    for (const invalid of [
      { ...claims, session_id: undefined },
      { ...claims, session_id: '123' },
      { ...claims, sub: 'not-a-user-id' },
      { ...claims, role: 'service_role' },
      { ...claims, role: 'anon' },
      { ...claims, is_anonymous: true },
    ]) {
      await expect(validateSignedSessionClaims(invalid, check)).rejects.toThrow('Token inválido')
    }
    expect(check).not.toHaveBeenCalled()
  })

  it('nunca concede aal2 sem a claim assinada', async () => {
    await expect(validateSignedSessionClaims({ ...claims, aal: 'aal1' }, async () => ({ active: true, mfaRequired: false })))
      .resolves.toEqual({ userId, assuranceLevel: 'aal1', mfaRequired: false })
    await expect(validateSignedSessionClaims({ ...claims, aal: undefined }, async () => ({ active: true, mfaRequired: false })))
      .resolves.toEqual({ userId, assuranceLevel: 'aal1', mfaRequired: false })
  })

  it('recusa sucesso da sessão sem informação confiável dos fatores MFA', async () => {
    for (const state of [true, { active: true }, { active: true, mfaRequired: null }]) {
      await expect(validateSignedSessionClaims(claims, async () => state as never))
        .rejects.toThrow('Estado da sessão ou do MFA não confirmado')
    }
  })
})
