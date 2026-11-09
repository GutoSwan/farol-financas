/** Dados mínimos: não colocamos títulos, descrições ou identidade nas notificações. */
export interface ReminderData {
  id: string
  starts_at: string
  reminder_minutes: number | null
}
export interface NativeReminder {
  id: number
  at: Date
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const VALID_MINUTES = new Set([0, 5, 10, 15, 30, 60, 1440])
const MAX_PENDING = 50
const MAX_AHEAD_MS = 60 * 24 * 60 * 60 * 1000

/** Reserva IDs positivos em um intervalo não usado por outras rotinas do Farol. */
function stableNotificationId(eventId: string): number {
  let hash = 2166136261
  for (const character of eventId) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return 1_000_000_000 + ((hash >>> 0) % 1_000_000_000)
}

/** Seleção determinística, sem usar conteúdo privado nem agendar eventos vencidos. */
export function nativeRemindersToSchedule(items: ReminderData[], now = new Date()): NativeReminder[] {
  const current = now.getTime()
  if (!Number.isFinite(current)) return []
  const result: NativeReminder[] = []
  const usedIds = new Set<number>()
  const sorted = items.flatMap(item => {
    if (!UUID.test(item.id) || item.reminder_minutes === null ||
        !VALID_MINUTES.has(item.reminder_minutes)) return []
    const start = new Date(item.starts_at).getTime()
    const trigger = start - item.reminder_minutes * 60_000
    if (!Number.isFinite(trigger) || trigger <= current || trigger > current + MAX_AHEAD_MS) return []
    return [{ id: stableNotificationId(item.id), at: new Date(trigger) }]
  }).sort((a, b) => a.at.getTime() - b.at.getTime())

  for (const reminder of sorted) {
    if (usedIds.has(reminder.id)) continue
    usedIds.add(reminder.id)
    result.push(reminder)
    if (result.length >= MAX_PENDING) break
  }
  return result
}
