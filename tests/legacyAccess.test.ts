import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claimLegacyData, localLegacyAccess, setVerifiedLocalUser } from '../src/infrastructure/persistence/legacyAccess'

const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'

describe('Vinculação de dados financeiros locais antigos', () => {
  const map = new Map<string, string>()
  beforeEach(() => {
    map.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => { map.set(key, value) },
      removeItem: (key: string) => { map.delete(key) },
    })
    setVerifiedLocalUser(null)
  })
  it('nega acesso quando a identidade ainda não foi validada', () => {
    expect(localLegacyAccess(owner)).toBe('different-user')
    expect(() => claimLegacyData(owner)).toThrow()
  })
  it('não atribui dados locais automaticamente no primeiro login', () => {
    setVerifiedLocalUser(owner)
    expect(localLegacyAccess(owner)).toBe('unclaimed')
    expect(map.size).toBe(0)
  })
  it('só permite vinculação após autorização explícita', () => {
    setVerifiedLocalUser(owner)
    claimLegacyData(owner)
    expect(localLegacyAccess(owner)).toBe('allowed')
    expect(localLegacyAccess(other)).toBe('different-user')
  })
  it('impede que outra conta assuma dados já vinculados', () => {
    setVerifiedLocalUser(owner)
    claimLegacyData(owner)
    setVerifiedLocalUser(other)
    expect(localLegacyAccess(other)).toBe('different-user')
    expect(() => claimLegacyData(other)).toThrow()
    setVerifiedLocalUser(owner)
    expect(localLegacyAccess(owner)).toBe('allowed')
  })
  it('falha de modo fechado se localStorage estiver inacessível', () => {
    setVerifiedLocalUser(owner)
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('unavailable') },
    })
    expect(localLegacyAccess(owner)).toBe('unavailable')
    expect(() => claimLegacyData(owner)).toThrow()
  })
})
