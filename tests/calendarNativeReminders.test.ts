import { describe, expect, it } from 'vitest'
import { nativeRemindersToSchedule } from '../src/domain/calendar/nativeReminders'

const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const now = new Date('2026-11-09T12:00:00.000Z')

describe('Lembretes nativos sem dados sensíveis', () => {
  it('agenda somente eventos futuros e com intervalo válido', () => {
    const result = nativeRemindersToSchedule([
      { id: id(1), starts_at: '2026-11-09T12:10:00.000Z', reminder_minutes: 5 },
      { id: id(2), starts_at: '2026-11-09T11:00:00.000Z', reminder_minutes: 5 },
      { id: id(3), starts_at: '2026-11-09T12:10:00.000Z', reminder_minutes: 999 },
      { id: 'invalid', starts_at: '2026-11-09T13:00:00.000Z', reminder_minutes: 0 },
    ], now)
    expect(result).toHaveLength(1)
    expect(result[0].at.toISOString()).toBe('2026-11-09T12:05:00.000Z')
    expect(result[0].id).toBeGreaterThanOrEqual(1_000_000_000)
  })

  it('mantém IDs determinísticos e remove duplicatas', () => {
    const entry = { id: id(4), starts_at: '2026-11-10T12:00:00.000Z', reminder_minutes: 60 }
    expect(nativeRemindersToSchedule([entry, entry], now)).toEqual(nativeRemindersToSchedule([entry], now))
  })

  it('limita a fila nativa e não agenda um prazo distante', () => {
    const items = Array.from({ length: 70 }, (_, i) => ({
      id: id(i + 100), starts_at: new Date(now.getTime() + (i + 1) * 3600000).toISOString(), reminder_minutes: 0,
    }))
    items.push({ id: id(999), starts_at: '2027-06-01T12:00:00.000Z', reminder_minutes: 0 })
    expect(nativeRemindersToSchedule(items, now)).toHaveLength(50)
  })

  it('não agenda o evento sem lembrete', () => {
    expect(nativeRemindersToSchedule([
      { id: id(1), starts_at: '2026-11-10T12:00:00.000Z', reminder_minutes: null },
    ], now)).toEqual([])
  })
})
