import { describe, expect, it } from 'vitest'
import { eventDateRangeFromInputs, eventOccursOnDay } from '../src/domain/calendar/eventDates'

describe('Eventos de vários dias e dia inteiro', () => {
  it('mostra um evento em todos os dias abrangidos', () => {
    const event = {
      starts_at: new Date(2026, 10, 9, 22, 0).toISOString(),
      ends_at: new Date(2026, 10, 11, 8, 0).toISOString(),
    }
    expect(eventOccursOnDay(event, '2026-11-09')).toBe(true)
    expect(eventOccursOnDay(event, '2026-11-10')).toBe(true)
    expect(eventOccursOnDay(event, '2026-11-11')).toBe(true)
    expect(eventOccursOnDay(event, '2026-11-12')).toBe(false)
  })

  it('respeita o término exclusivo na meia-noite', () => {
    const event = {
      starts_at: new Date(2026, 10, 9).toISOString(),
      ends_at: new Date(2026, 10, 10).toISOString(),
    }
    expect(eventOccursOnDay(event, '2026-11-09')).toBe(true)
    expect(eventOccursOnDay(event, '2026-11-10')).toBe(false)
  })

  it('dia inteiro abrange a data final escolhida e permite vários dias', () => {
    const { startDate, endDate } = eventDateRangeFromInputs('2026-11-09', '2026-11-11', true)
    expect(startDate.getHours()).toBe(0)
    expect(endDate.getDate()).toBe(12)
    expect(eventOccursOnDay({ starts_at: startDate.toISOString(), ends_at: endDate.toISOString() }, '2026-11-11')).toBe(true)
    expect(eventOccursOnDay({ starts_at: startDate.toISOString(), ends_at: endDate.toISOString() }, '2026-11-12')).toBe(false)
  })

  it('rejeita fim anterior ao início', () => {
    expect(() => eventDateRangeFromInputs('2026-11-11', '2026-11-09', true)).toThrow()
    expect(() => eventDateRangeFromInputs('2026-11-09T15:00', '2026-11-09T14:59', false)).toThrow()
  })
})
