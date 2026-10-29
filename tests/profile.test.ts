import { describe, expect, it } from 'vitest'
import { normalizeDisplayName, normalizeProfileIcon, readProfile, PROFILE_ICONS } from '../src/domain/profile/profile'

describe('Personalização do perfil', () => {
  it('normaliza nomes sem permitir espaços e tamanho inválido', () => {
    expect(normalizeDisplayName('  Ana   Laura  ')).toBe('Ana Laura')
    expect(() => normalizeDisplayName('A')).toThrow()
    expect(() => normalizeDisplayName(' '.repeat(5))).toThrow()
    expect(() => normalizeDisplayName('x'.repeat(41))).toThrow()
  })
  it('aceita apenas ícones da lista, evitando urls ou scripts em metadados', () => {
    expect(PROFILE_ICONS).toContain('cat')
    expect(normalizeProfileIcon('cat')).toBe('cat')
    expect(normalizeProfileIcon('https://site.exemplo/foto.jpg')).toBe('user')
    expect(normalizeProfileIcon('<script>')).toBe('user')
  })
  it('usa nome e ícone salvo; fallback para identificador de email', () => {
    expect(readProfile({ display_name: '  Gustavo  ', avatar_icon: 'rocket' }, 'a@b.com'))
      .toEqual({ displayName: 'Gustavo', avatarIcon: 'rocket' })
    expect(readProfile({}, 'pessoa@exemplo.com'))
      .toEqual({ displayName: 'pessoa', avatarIcon: 'user' })
  })
})
