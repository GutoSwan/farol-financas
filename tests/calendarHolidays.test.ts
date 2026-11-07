import { describe, expect, it } from 'vitest'
import { getHolidays } from '../src/domain/calendar/holidays'

describe('Feriados do calendário', () => {
 it('exibe feriados nacionais, inclusive Consciência Negra', () => {
  const holidays=getHolidays(2026,'BR')
  expect(holidays).toContainEqual({date:'2026-11-20',name:'Consciência Negra',level:'Nacional'})
  expect(holidays).not.toContainEqual(expect.objectContaining({date:'2026-07-09'}))
 })
 it('adiciona somente o feriado estadual de São Paulo na escolha SP', () => {
  expect(getHolidays(2026,'SP')).toContainEqual({date:'2026-07-09',name:'Revolução Constitucionalista',level:'Estadual'})
 })
 it('não classifica feriados locais e pontos facultativos como nacionais', () => {
  expect(getHolidays(2026,'BR').map(h=>h.name)).not.toContain('Carnaval')
  expect(getHolidays(2026,'BR').map(h=>h.name)).not.toContain('Sexta-feira Santa')
 })
})
