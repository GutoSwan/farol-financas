import type { Gift, GiftInput, GiftOwner, GiftPriority } from '../../domain/entities/Gift'
import { GIFT_OWNERS, GIFT_PRIORITY_RANK } from '../../domain/entities/Gift'
import { normalizeGiftInput } from '../../domain/services/giftValidation'

/** Uma lista pessoal, independente dos espaços e valores dos relatórios financeiros. */
export const GIFT_STORAGE_KEY = 'farol-financas:gifts:v1'
const USER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Separação por identidade; não é criptografia de arquivos locais. */
export function giftStorageKeyForUser(userId: string): string {
  if (!USER_UUID.test(userId)) throw new Error('Identidade inválida para acessar os presentes.')
  return GIFT_STORAGE_KEY + ':' + userId.toLowerCase()
}

function isGift(value: unknown): value is Gift {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && item.id.length > 0 &&
    GIFT_OWNERS.includes(item.owner as GiftOwner) &&
    typeof item.name === 'string' &&
    Number.isSafeInteger(item.priceCents) && (item.priceCents as number) >= 0 &&
    typeof item.productUrl === 'string' &&
    (['high', 'medium', 'low'] as GiftPriority[]).includes(item.priority as GiftPriority) &&
    typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

export class BrowserGiftRepository {
  private readonly storageKey: string

  constructor(userId: string) {
    this.storageKey = giftStorageKeyForUser(userId)
  }

  private decode(raw: string): Gift[] {
    const decoded: unknown = JSON.parse(raw)
    if (!Array.isArray(decoded) || !decoded.every(isGift)) throw new Error('Estrutura inválida.')
    return decoded
  }

  private read(): Gift[] {
    try {
      const raw = localStorage.getItem(this.storageKey)
      return raw === null ? [] : this.decode(raw)
    } catch {
      throw new Error('Não foi possível ler os presentes. Não limpe os dados do navegador antes de recuperá-los.')
    }
  }

  /**
   * Os registros antigos não identificavam o dono. Nunca atribuí-los
   * automaticamente à primeira conta administrativa que abrir o navegador.
   */
  hasLegacyGifts(): boolean {
    try {
      const raw = localStorage.getItem(GIFT_STORAGE_KEY)
      return raw !== null && this.decode(raw).length > 0
    } catch {
      throw new Error('A lista antiga de presentes não pôde ser conferida; os dados foram preservados.')
    }
  }

  /**
   * Chamar SOMENTE após confirmação consciente do usuário autenticado.
   * Mescla registros válidos sem substituir presentes existentes.
   * Se falhar a gravação, conserva a origem antiga para recuperação.
   */
  importLegacyGifts(): number {
    try {
      const legacyRaw = localStorage.getItem(GIFT_STORAGE_KEY)
      if (legacyRaw === null) return 0
      const oldItems = this.decode(legacyRaw)
      const current = this.read()
      const seen = new Set(current.map(gift => gift.id))
      if (oldItems.some(gift => seen.has(gift.id))) {
        throw new Error('Existe um presente com o mesmo identificador na conta. Nada foi importado.')
      }
      localStorage.setItem(this.storageKey, JSON.stringify([...current, ...oldItems]))
      // A cópia já foi gravada; se a limpeza falhar, nunca apagar a cópia.
      localStorage.removeItem(GIFT_STORAGE_KEY)
      return oldItems.length
    } catch {
      throw new Error('Não foi possível importar os presentes antigos. Os dados de origem não foram apagados.')
    }
  }

  private write(items: Gift[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(items))
    } catch {
      throw new Error('Não foi possível salvar os presentes neste navegador. Confira o espaço disponível.')
    }
  }

  list(owner: GiftOwner): Gift[] {
    return this.read().filter((item) => item.owner === owner)
      .sort((a, b) => GIFT_PRIORITY_RANK[a.priority] - GIFT_PRIORITY_RANK[b.priority] ||
        b.createdAt.localeCompare(a.createdAt))
  }

  add(owner: GiftOwner, draft: GiftInput): Gift {
    if (!GIFT_OWNERS.includes(owner)) throw new Error('Escolha Gustavo ou Ana.')
    const fields = normalizeGiftInput(draft)
    const now = new Date().toISOString()
    const item: Gift = {
      id: crypto.randomUUID(), owner, ...fields, createdAt: now, updatedAt: now,
    }
    this.write([...this.read(), item])
    return item
  }

  update(owner: GiftOwner, id: string, draft: GiftInput): Gift {
    const existing = this.read()
    const index = existing.findIndex((item) => item.id === id && item.owner === owner)
    if (index < 0) throw new Error('O presente não foi encontrado na lista selecionada.')
    const updated: Gift = {
      ...existing[index], ...normalizeGiftInput(draft), updatedAt: new Date().toISOString(),
    }
    existing[index] = updated
    this.write(existing)
    return updated
  }

  remove(owner: GiftOwner, id: string): void {
    const items = this.read()
    if (!items.some((item) => item.id === id && item.owner === owner)) {
      throw new Error('O presente não foi encontrado na lista selecionada.')
    }
    this.write(items.filter((item) => !(item.id === id && item.owner === owner)))
  }
}
