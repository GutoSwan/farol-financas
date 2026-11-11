import { beforeEach, describe, expect, it } from 'vitest'
import { BrowserGiftRepository, GIFT_STORAGE_KEY, giftStorageKeyForUser } from '../src/infrastructure/persistence/BrowserGiftRepository'
import { normalizeGiftUrl } from '../src/domain/services/giftValidation'
import { validateGiftPhoto, MAX_GIFT_PHOTO_BYTES } from '../src/infrastructure/persistence/GiftPhotoStorage'

const data = new Map<string, string>()
const ADMIN_A = '11111111-1111-4111-8111-111111111111'
const ADMIN_B = '22222222-2222-4222-8222-222222222222'
beforeEach(() => {
  data.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value) },
      removeItem: (key: string) => { data.delete(key) },
    },
  })
})

const high = { name: '  Notebook dos sonhos  ', priceCents: 510000, productUrl: 'loja.com.br/produto', priority: 'high' as const }
const medium = { name: 'Fone de ouvido', priceCents: 25000, productUrl: '', priority: 'medium' as const }

describe('Presentes pessoais Gustavo e Ana', () => {
  it('adiciona, restaura e separa os presentes das duas pessoas', () => {
    const repo = new BrowserGiftRepository(ADMIN_A)
    const gustavo = repo.add('gustavo', high)
    const ana = repo.add('ana', medium)
    const reopened = new BrowserGiftRepository(ADMIN_A)
    expect(reopened.list('gustavo')).toHaveLength(1)
    expect(reopened.list('gustavo')[0]).toMatchObject({ id: gustavo.id, name: 'Notebook dos sonhos', productUrl: 'https://loja.com.br/produto' })
    expect(reopened.list('ana')[0].id).toBe(ana.id)
    expect(data.has(giftStorageKeyForUser(ADMIN_A))).toBe(true)
  })

  it('edita valor, link e prioridade e permite remover somente o presente correto', () => {
    const repo = new BrowserGiftRepository(ADMIN_A)
    const gustavo = repo.add('gustavo', medium)
    const ana = repo.add('ana', medium)
    repo.update('gustavo', gustavo.id, { ...high, priority: 'low' })
    expect(repo.list('gustavo')[0]).toMatchObject({ name: 'Notebook dos sonhos', priceCents: 510000, priority: 'low' })
    expect(() => repo.update('gustavo', ana.id, high)).toThrow('não foi encontrado')
    expect(() => repo.remove('ana', gustavo.id)).toThrow('não foi encontrado')
    repo.remove('gustavo', gustavo.id)
    expect(repo.list('gustavo')).toEqual([])
    expect(repo.list('ana')).toHaveLength(1)
  })

  it('ordena pela prioridade escolhida, verde antes de amarelo e vermelho', () => {
    const repo = new BrowserGiftRepository(ADMIN_A)
    repo.add('gustavo', { ...high, priority: 'low' })
    repo.add('gustavo', medium)
    repo.add('gustavo', high)
    expect(repo.list('gustavo').map(x => x.priority)).toEqual(['high', 'medium', 'low'])
  })

  it('não admite links maliciosos, preço negativo ou nome vazio', () => {
    const repo = new BrowserGiftRepository(ADMIN_A)
    expect(() => repo.add('ana', { ...high, productUrl: 'javascript:alert(1)' })).toThrow()
    expect(() => repo.add('ana', { ...high, priceCents: -1 })).toThrow()
    expect(() => repo.add('ana', { ...high, name: ' ' })).toThrow()
    expect(normalizeGiftUrl('')).toBe('')
    expect(normalizeGiftUrl('https://mercadolivre.com.br/produto')).toBe('https://mercadolivre.com.br/produto')
    expect(repo.list('ana')).toEqual([])
  })

  it('nunca sobrescreve registros locais se o JSON anterior estiver inválido', () => {
    data.set(giftStorageKeyForUser(ADMIN_A), 'não é JSON')
    const repo = new BrowserGiftRepository(ADMIN_A)
    expect(() => repo.add('gustavo', high)).toThrow('Não foi possível ler')
    expect(data.get(giftStorageKeyForUser(ADMIN_A))).toBe('não é JSON')
  })

  it('aceita PNG e impede fotos exageradamente grandes ou arquivos executáveis', () => {
    expect(() => validateGiftPhoto(new Blob(['imagem'], { type: 'image/png' }))).not.toThrow()
    expect(() => validateGiftPhoto(new Blob(['arquivo'], { type: 'image/svg+xml' }))).toThrow()
    expect(() => validateGiftPhoto(new Blob([],{type:'image/png'}))).toThrow()
    expect(MAX_GIFT_PHOTO_BYTES).toBe(8 * 1024 * 1024)
  })
})

describe('Privacidade de presentes entre contas no mesmo navegador', () => {
  it('uma conta não pode carregar ou modificar os presentes da outra pela interface', () => {
    const alice = new BrowserGiftRepository(ADMIN_A)
    const bob = new BrowserGiftRepository(ADMIN_B)
    const gift = alice.add('gustavo', high)
    expect(bob.list('gustavo')).toEqual([])
    expect(() => bob.update('gustavo', gift.id, medium)).toThrow('não foi encontrado')
    expect(() => bob.remove('gustavo', gift.id)).toThrow('não foi encontrado')
    expect(alice.list('gustavo')).toHaveLength(1)
    expect(data.has(giftStorageKeyForUser(ADMIN_A))).toBe(true)
    expect(data.has(giftStorageKeyForUser(ADMIN_B))).toBe(false)
  })

  it('não atribui registros antigos automaticamente à primeira conta que entrar', () => {
    const earlier = new BrowserGiftRepository(ADMIN_A)
    const gift = earlier.add('ana', medium)
    const oldRecords = data.get(giftStorageKeyForUser(ADMIN_A))!
    data.delete(giftStorageKeyForUser(ADMIN_A))
    data.set(GIFT_STORAGE_KEY, oldRecords)

    const other = new BrowserGiftRepository(ADMIN_B)
    expect(other.hasLegacyGifts()).toBe(true)
    expect(other.list('ana')).toEqual([])
    expect(data.has(giftStorageKeyForUser(ADMIN_B))).toBe(false)
    expect(data.get(GIFT_STORAGE_KEY)).toBe(oldRecords)

    const owner = new BrowserGiftRepository(ADMIN_A)
    expect(owner.importLegacyGifts()).toBe(1)
    expect(owner.list('ana')[0].id).toBe(gift.id)
    expect(data.has(GIFT_STORAGE_KEY)).toBe(false)
  })

  it('preserva a origem se a importação encontrar um identificador duplicado', () => {
    const owner = new BrowserGiftRepository(ADMIN_A)
    owner.add('ana', medium)
    const originals = data.get(giftStorageKeyForUser(ADMIN_A))!
    data.set(GIFT_STORAGE_KEY, originals)
    expect(() => owner.importLegacyGifts()).toThrow('Não foi possível importar')
    expect(data.get(GIFT_STORAGE_KEY)).toBe(originals)
    expect(data.get(giftStorageKeyForUser(ADMIN_A))).toBe(originals)
  })

  it('recusa ID de usuário inválido antes de tocar no armazenamento', () => {
    expect(() => new BrowserGiftRepository('anonymous')).toThrow('Identidade inválida')
    expect(data.size).toBe(0)
  })
})
