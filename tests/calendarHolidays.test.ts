import { describe, expect, it } from 'vitest'
import { easterSunday, getHolidays } from '../src/domain/calendar/holidays'

describe('Feriados por região', () => {
  it('inclui a Paixão de Cristo e Consciência Negra nos feriados nacionais de 2026', () => {
    const holidays = getHolidays(2026, 'BR')
    expect(holidays).toContainEqual({ date: '2026-04-03', name: 'Paixão de Cristo', level: 'Nacional' })
    expect(holidays).toContainEqual({ date: '2026-11-20', name: 'Consciência Negra', level: 'Nacional' })
    expect(holidays).not.toContainEqual(expect.objectContaining({ date: '2026-07-09' }))
  })

  it('inclui feriado estadual sem apresentar feriados municipais de outra cidade', () => {
    const holidays = getHolidays(2026, 'SP')
    expect(holidays).toContainEqual({ date: '2026-07-09', name: 'Revolução Constitucionalista', level: 'Estadual' })
    expect(holidays).not.toContainEqual(expect.objectContaining({ date: '2026-08-15' }))
  })

  it('inclui Sorocaba e calcula Corpus Christi sem erro entre os anos', () => {
    const in2026 = getHolidays(2026, 'SOROCABA')
    expect(in2026).toContainEqual({ date: '2026-06-04', name: 'Corpus Christi', level: 'Municipal' })
    expect(in2026).toContainEqual({ date: '2026-08-15', name: 'Aniversário de Sorocaba', level: 'Municipal' })
    expect(getHolidays(2027, 'SOROCABA')).toContainEqual({
      date: '2027-05-27', name: 'Corpus Christi', level: 'Municipal',
    })
    expect(easterSunday(2027).toISOString().slice(0, 10)).toBe('2027-03-28')
  })

  it('não apresenta pontos facultativos como feriados nacionais e não duplica a Consciência Negra', () => {
    const holidays = getHolidays(2026, 'SOROCABA')
    expect(holidays.map((holiday) => holiday.name)).not.toContain('Carnaval')
    expect(holidays.filter((holiday) => holiday.date === '2026-11-20')).toHaveLength(1)
  })
})
