export const GIFT_OWNERS = ['gustavo', 'ana'] as const
export type GiftOwner = typeof GIFT_OWNERS[number]
export type GiftPriority = 'high' | 'medium' | 'low'

export interface Gift {
  id: string
  owner: GiftOwner
  name: string
  priceCents: number
  productUrl: string
  priority: GiftPriority
  createdAt: string
  updatedAt: string
}

export type GiftInput = Pick<Gift, 'name' | 'priceCents' | 'productUrl' | 'priority'>

export const GIFT_OWNER_NAMES: Record<GiftOwner, string> = {
  gustavo: 'Gustavo',
  ana: 'Ana',
}

export const GIFT_PRIORITY_NAMES: Record<GiftPriority, string> = {
  high: 'Quero muito',
  medium: 'Quero mais ou menos',
  low: 'Nem tanto',
}

export const GIFT_PRIORITY_RANK: Record<GiftPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}
