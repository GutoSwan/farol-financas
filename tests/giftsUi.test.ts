import { describe, expect, it } from 'vitest'
import sidebar from '../src/presentation/layouts/AppLayout.vue?raw'
import routes from '../src/router/index.ts?raw'
import gifts from '../src/presentation/pages/GiftsPage.vue?raw'
import photos from '../src/presentation/components/GiftPhoto.vue?raw'
import main from '../src/main.ts?raw'

describe('Experiência de presentes na barra lateral', () => {
  it('abre uma tela própria com seletor de Gustavo e Ana, acessível por modal', () => {
    expect(sidebar).toContain('to="/presentes"')
    expect(sidebar).toContain('v-if="isAdmin"')
    expect(routes).toContain("path: 'presentes', component: GiftsPage")
    expect(gifts).toContain('role="dialog"')
    expect(gifts).toContain("choosePerson('gustavo')")
    expect(gifts).toContain("choosePerson('ana')")
    expect(gifts).toContain('Trocar pessoa')
  })

  it('permite adicionar, editar, excluir e abrir links externos com segurança', () => {
    expect(gifts).toContain('repository.value.add(')
    expect(gifts).toContain('repository.value.update(')
    expect(gifts).toContain('repository.value.remove(')
    expect(gifts).toContain('rel="noopener noreferrer"')
    expect(gifts).toContain('parseBRLToCents')
    expect(gifts).toContain('new BrowserGiftRepository(user.value.id)')
  })

  it('identifica verde, amarelo e vermelho e mostra opção de foto por presente', () => {
    expect(gifts).toContain("priority === 'high'")
    expect(gifts).toContain("priority === 'medium'")
    expect(gifts).toContain("priority === 'low'")
    expect(photos).toContain('Arraste a foto PNG aqui')
    expect(photos).toContain('@drop.prevent="dropFile"')
    expect(photos).toContain('saveGiftPhoto(props.giftId, file)')
    expect(main).toContain("import './assets/styles/gifts.css'")
    expect(gifts).toContain("'gift-card-' + gift.priority")
  })

  it('deixa explícito que as listas ainda são locais e não afetam os gastos', () => {
    expect(gifts).toContain('não entra nos gastos do Farol')
    expect(gifts).toContain('Ainda não são compartilhados entre celulares ou contas')
  })
})
