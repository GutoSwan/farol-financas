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
 it('inclui feriados municipais confirmados de Sorocaba em 2026, sem pontos facultativos', () => {
  const holidays=getHolidays(2026,'SOROCABA')
  expect(holidays).toContainEqual({date:'2026-06-04',name:'Corpus Christi',level:'Municipal'})
  expect(holidays).toContainEqual({date:'2026-08-15',name:'Aniversário de Sorocaba',level:'Municipal'})
  expect(holidays).toContainEqual({date:'2026-07-09',name:'Revolução Constitucionalista',level:'Estadual'})
  expect(holidays).not.toContainEqual(expect.objectContaining({date:'2026-07-10'}))
  expect(holidays).not.toContainEqual(expect.objectContaining({date:'2026-06-05'}))
  expect(holidays.filter(h=>h.date==='2026-11-20')).toHaveLength(1)
 })
 it('não inventa feriados municipais de Sorocaba para outros anos', () => {
  expect(getHolidays(2027,'SOROCABA').every(h=>h.level!=='Municipal')).toBe(true)
  expect(getHolidays(2026,'BR').some(h=>h.level==='Municipal')).toBe(false)
  expect(getHolidays(2026,'SP').some(h=>h.level==='Municipal')).toBe(false)
 })

})
