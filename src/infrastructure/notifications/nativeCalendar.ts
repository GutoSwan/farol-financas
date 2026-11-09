import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { nativeRemindersToSchedule } from '../../domain/calendar/nativeReminders'
import type { ReminderData } from '../../domain/calendar/nativeReminders'

export function isNativeCalendar(): boolean {
  return Capacitor.isNativePlatform()
}

export async function canUseNativeCalendarNotifications(): Promise<boolean> {
  if (!isNativeCalendar()) return false
  const permissions = await LocalNotifications.checkPermissions()
  return permissions.display === 'granted'
}

export async function requestNativeCalendarNotifications(): Promise<boolean> {
  if (!isNativeCalendar()) return false
  const permissions = await LocalNotifications.requestPermissions()
  return permissions.display === 'granted'
}

/** Remove somente notificações do Calendário do Farol, sem tocar nas de outros plugins. */
export async function cancelNativeCalendarNotifications(): Promise<void> {
  if (!isNativeCalendar()) return
  const pending = await LocalNotifications.getPending()
  const owned = pending.notifications.filter((notification) =>
    notification.extra?.farolCalendar === true)
  if (owned.length) {
    await LocalNotifications.cancel({ notifications: owned.map(({ id }) => ({ id })) })
  }
}

/** Uso exclusivo após autenticação e consentimento, dados privados ficam no banco. */
export async function syncNativeCalendarNotifications(items: ReminderData[]): Promise<void> {
  if (!await canUseNativeCalendarNotifications()) return
  // Para não deixar alertas de eventos excluídos, trocados ou de outra conta.
  await cancelNativeCalendarNotifications()
  const schedule = nativeRemindersToSchedule(items).map((item) => ({
    id: item.id,
    title: 'Lembrete do Farol',
    body: 'Você tem um compromisso agendado.',
    schedule: { at: item.at },
    extra: { farolCalendar: true },
  }))
  if (schedule.length) await LocalNotifications.schedule({ notifications: schedule })
}
