import { beforeEach, describe, expect, it } from 'vitest'
import { BrowserGiftRepository, GIFT_STORAGE_KEY } from '../src/infrastructure/persistence/BrowserGiftRepository'
import { normalizeGiftUrl } from '../src/domain/services/giftValidation'
import { validateGiftPhoto, MAX_GIFT_PHOTO_BYTES } from '../src/infrastructure/persistence/GiftPhotoStorage'

const data = new Map<string, string>()
beforeEach(() => {
  data.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value) },
    },
  })
})

const high = { name: '  Notebook dos sonhos  ', priceCents: 510000, productUrl: 'loja.com.br/produto', priority: 'high' as const }
const medium = { name: 'Fone de ouvido', priceCents: 25000, productUrl: '', priority: 'medium' as const }

describe('Presentes pessoais Gustavo e Ana', () => {
  it('adiciona, restaura e separa os presentes das duas pessoas', () => {
    const repo = new BrowserGiftRepository()
    const gustavo = repo.add('gustavo', high)
    const ana = repo.add('ana', medium)
    const reopened = new BrowserGiftRepository()
    expect(reopened.list('gustavo')).toHaveLength(1)
    expect(reopened.list('gustavo')[0]).toMatchObject({ id: gustavo.id, name: 'Notebook dos sonhos', productUrl: 'https://loja.com.br/produto' })
    expect(reopened.list('ana')[0].id).toBe(ana.id)
    expect(data.has(GIFT_STORAGE_KEY)).toBe(true)
  })

  it('edita valor, link e prioridade e permite remover somente o presente correto', () => {
    const repo = new BrowserGiftRepository()
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
    const repo = new BrowserGiftRepository()
    repo.add('gustavo', { ...high, priority: 'low' })
    repo.add('gustavo', medium)
    repo.add('gustavo', high)
    expect(repo.list('gustavo').map(x => x.priority)).toEqual(['high', 'medium', 'low'])
  })

  it('não admite links maliciosos, preço negativo ou nome vazio', () => {
    const repo = new BrowserGiftRepository()
    expect(() => repo.add('ana', { ...high, productUrl: 'javascript:alert(1)' })).toThrow()
    expect(() => repo.add('ana', { ...high, priceCents: -1 })).toThrow()
    expect(() => repo.add('ana', { ...high, name: ' ' })).toThrow()
    expect(normalizeGiftUrl('')).toBe('')
    expect(normalizeGiftUrl('https://mercadolivre.com.br/produto')).toBe('https://mercadolivre.com.br/produto')
    expect(repo.list('ana')).toEqual([])
  })

  it('nunca sobrescreve registros locais se o JSON anterior estiver inválido', () => {
    data.set(GIFT_STORAGE_KEY, 'não é JSON')
    const repo = new BrowserGiftRepository()
    expect(() => repo.add('gustavo', high)).toThrow('Não foi possível ler')
    expect(data.get(GIFT_STORAGE_KEY)).toBe('não é JSON')
  })

  it('aceita PNG e impede fotos exageradamente grandes ou arquivos executáveis', () => {
    expect(() => validateGiftPhoto(new Blob(['imagem'], { type: 'image/png' }))).not.toThrow()
    expect(() => validateGiftPhoto(new Blob(['arquivo'], { type: 'image/svg+xml' }))).toThrow()
    expect(() => validateGiftPhoto(new Blob([],{type:'image/png'}))).toThrow()
    expect(MAX_GIFT_PHOTO_BYTES).toBe(8 * 1024 * 1024)
  })
})
