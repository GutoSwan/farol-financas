import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  user: vi.fn(),
  assurance: vi.fn(),
  factors: vi.fn(),
  unenroll: vi.fn(),
}))

vi.mock('../src/infrastructure/auth/supabase', () => ({
  supabase: {
    auth: {
      getUser: fake.user,
      mfa: {
        getAuthenticatorAssuranceLevel: fake.assurance,
        listFactors: fake.factors,
        unenroll: fake.unenroll,
      },
    },
  },
}))

import { discardUnverifiedTotpFactor, removeVerifiedTotpFactor } from '../src/infrastructure/auth/totpMfa'

const factorId = '11111111-1111-4111-8111-111111111111'

describe('Remoção de TOTP exige autorização remota', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fake.user.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    fake.assurance.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
    fake.factors.mockResolvedValue({ data: { totp: [{ id: factorId, status: 'verified' }], all: [] }, error: null })
    fake.unenroll.mockResolvedValue({ data: {}, error: null })
  })

  it('remove apenas fator verificado e pertencente à sessão autenticada', async () => {
    await removeVerifiedTotpFactor(factorId)
    expect(fake.unenroll).toHaveBeenCalledTimes(1)
    expect(fake.unenroll).toHaveBeenCalledWith({ factorId })
  })

  it('bloqueia remoção com AAL1, inclusive após senha correta', async () => {
    fake.assurance.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    await expect(removeVerifiedTotpFactor(factorId)).rejects.toThrow(/segundo fator/)
    expect(fake.unenroll).not.toHaveBeenCalled()
  })

  it('bloqueia sem usuário autenticado', async () => {
    fake.user.mockResolvedValue({ data: { user: null }, error: null })
    await expect(removeVerifiedTotpFactor(factorId)).rejects.toThrow(/Entre novamente/)
    expect(fake.unenroll).not.toHaveBeenCalled()
  })

  it('bloqueia um fator que não pertence à conta', async () => {
    fake.factors.mockResolvedValue({ data: { totp: [], all: [] }, error: null })
    await expect(removeVerifiedTotpFactor(factorId)).rejects.toThrow(/não está mais vinculado/)
    expect(fake.unenroll).not.toHaveBeenCalled()
  })

  it('não envia fatores inválidos para API do Supabase', async () => {
    await expect(removeVerifiedTotpFactor('forged-id')).rejects.toThrow(/inválido/)
    expect(fake.unenroll).not.toHaveBeenCalled()
  })

  it('não informa sucesso quando Supabase recusa a exclusão', async () => {
    fake.unenroll.mockResolvedValue({ data: null, error: { message: 'Unauthenticated' } })
    await expect(removeVerifiedTotpFactor(factorId)).rejects.toThrow(/Não foi possível remover/)
  })
})


describe('Cancelamento de inscrição TOTP sem afirmação falsa de sucesso', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fake.factors.mockResolvedValue({ data: {
      totp: [], all: [{ id: factorId, status: 'unverified', factor_type: 'totp' }],
    }, error: null })
    fake.unenroll.mockResolvedValue({ data: { id: factorId }, error: null })
  })
  it('confirma o cancelamento somente se a API do Supabase o aceitar', async () => {
    await expect(discardUnverifiedTotpFactor(factorId)).resolves.toBeUndefined()
    expect(fake.unenroll).toHaveBeenCalledExactlyOnceWith({ factorId })
  })
  it('mantém pendência quando a lista de fatores falha', async () => {
    fake.factors.mockResolvedValue({ data: null, error: { message: 'offline' } })
    await expect(discardUnverifiedTotpFactor(factorId)).rejects.toThrow(/Não foi possível consultar/)
    expect(fake.unenroll).not.toHaveBeenCalled()
  })
  it('mantém pendência quando a remoção falha no servidor', async () => {
    fake.unenroll.mockResolvedValue({ data: null, error: { message: 'offline' } })
    await expect(discardUnverifiedTotpFactor(factorId)).rejects.toThrow(/não confirmou/)
    expect(fake.unenroll).toHaveBeenCalledTimes(1)
  })
  it('jamais remove por engano um fator já verificado', async () => {
    fake.factors.mockResolvedValue({ data: {
      totp: [], all: [{ id: factorId, status: 'verified', factor_type: 'totp' }],
    }, error: null })
    await expect(discardUnverifiedTotpFactor(factorId)).rejects.toThrow(/já foi confirmado/)
    expect(fake.unenroll).not.toHaveBeenCalled()
  })
  it('trata fator já inexistente como cancelado', async () => {
    fake.factors.mockResolvedValue({ data: { totp: [], all: [] }, error: null })
    await expect(discardUnverifiedTotpFactor(factorId)).resolves.toBeUndefined()
    expect(fake.unenroll).not.toHaveBeenCalled()
  })
  it('recusa identificador inválido antes de consultar fatores', async () => {
    await expect(discardUnverifiedTotpFactor('invalid-id')).rejects.toThrow(/inválido/)
    expect(fake.factors).not.toHaveBeenCalled()
  })
})
