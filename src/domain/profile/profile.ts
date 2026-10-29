/** Ícones fixos: não há upload de foto nesta versão do Farol. */
export const PROFILE_ICONS = ['user', 'star', 'heart', 'rocket', 'cat', 'leaf'] as const
export type ProfileIcon = typeof PROFILE_ICONS[number]

export interface Profile {
  displayName: string
  avatarIcon: ProfileIcon
}

export function normalizeDisplayName(input: string): string {
  const name = input.trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 40) {
    throw new Error('Seu nome deve ter entre 2 e 40 caracteres.')
  }
  return name
}

export function normalizeProfileIcon(icon: unknown): ProfileIcon {
  return typeof icon === 'string' && PROFILE_ICONS.some((item) => item === icon) ? icon as ProfileIcon : 'user'
}

export function readProfile(metadata: Record<string, unknown> | undefined, email?: string): Profile {
  const saved = metadata?.display_name
  const displayName = typeof saved === 'string' && saved.trim().length >= 2 && saved.trim().length <= 40
    ? saved.trim() : email?.split('@')[0] || 'Minha conta'
  return { displayName, avatarIcon: normalizeProfileIcon(metadata?.avatar_icon) }
}
