import { describe, expect, it } from 'vitest'
import sidebar from '../src/presentation/layouts/AppLayout.vue?raw'
import routes from '../src/router/index.ts?raw'
import gifts from '../src/presentation/pages/GiftsPage.vue?raw'
import photos from '../src/presentation/components/GiftPhoto.vue?raw'
import { readFileSync } from 'node:fs'
const css = readFileSync(new URL('../src/assets/styles/gifts.css', import.meta.url), 'utf8')

describe('Experiência de presentes na barra lateral', () => {
  it('abre uma tela própria com seletor de Gustavo e Ana, acessível por modal', () => {
    expect(sidebar).toContain("to: '/presentes', label: 'Presentes'")
    expect(routes).toContain("path: 'presentes', component: GiftsPage")
    expect(gifts).toContain('role="dialog"')
    expect(gifts).toContain("choosePerson('gustavo')")
    expect(gifts).toContain("choosePerson('ana')")
    expect(gifts).toContain('Trocar pessoa')
  })

  it('permite adicionar, editar, excluir e abrir links externos com segurança', () => {
    expect(gifts).toContain('repository.add(')
    expect(gifts).toContain('repository.update(')
    expect(gifts).toContain('repository.remove(')
    expect(gifts).toContain('rel="noopener noreferrer"')
    expect(gifts).toContain('parseBRLToCents')
  })

  it('identifica verde, amarelo e vermelho e mostra opção de foto por presente', () => {
    expect(gifts).toContain("priority === 'high'")
    expect(gifts).toContain("priority === 'medium'")
    expect(gifts).toContain("priority === 'low'")
    expect(photos).toContain('Arraste a foto PNG aqui')
    expect(photos).toContain('@drop.prevent="dropFile"')
    expect(photos).toContain('saveGiftPhoto(props.giftId, file)')
    expect(css).toContain('.gift-card-high')
    expect(css).toContain('.gift-card-medium')
    expect(css).toContain('.gift-card-low')
  })

  it('deixa explícito que as listas ainda são locais e não afetam os gastos', () => {
    expect(gifts).toContain('não entra nos gastos do Farol')
    expect(gifts).toContain('Ainda não são compartilhados entre celulares ou contas')
  })
})
