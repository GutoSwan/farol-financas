/** Intervalos são [início, fim), com horário local de quem usa o calendário. */
export interface CalendarEventInterval { starts_at: string; ends_at: string }

function atLocalMidnight(day: string): Date {
  return new Date(day + 'T00:00:00')
}

export function eventOccursOnDay(event: CalendarEventInterval, day: string): boolean {
  const dayStart = atLocalMidnight(day)
  const nextDay = new Date(dayStart)
  nextDay.setDate(nextDay.getDate() + 1)
  return new Date(event.starts_at) < nextDay && new Date(event.ends_at) > dayStart
}

export function eventDateRangeFromInputs(
  startInput: string, endInput: string, allDay: boolean,
): { startDate: Date; endDate: Date } {
  const startDate = allDay ? atLocalMidnight(startInput) : new Date(startInput)
  const endDate = allDay ? atLocalMidnight(endInput) : new Date(endInput)
  if (allDay && Number.isFinite(endDate.getTime())) endDate.setDate(endDate.getDate() + 1)
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())
    || endDate <= startDate || (allDay && endInput < startInput)) {
    throw new Error(allDay
      ? 'A data final não pode ser anterior à inicial.'
      : 'O término deve ser posterior ao início.')
  }
  return { startDate, endDate }
}
