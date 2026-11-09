export type CalendarRegion = 'BR' | 'SP' | 'SOROCABA'
export interface Holiday {
  date: string
  name: string
  level: 'Nacional' | 'Estadual' | 'Municipal'
}

/** Cálculo gregoriano da Páscoa sem depender do fuso horário do dispositivo. */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k + 7) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

function offsetFromEaster(year: number, offsetDays: number): string {
  const date = easterSunday(year)
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

/**
 * Feriados usados no Brasil, no estado de São Paulo e em Sorocaba.
 * Não presume localização por GPS e não confunde pontos facultativos com feriados.
 * Para outras cidades, adicionar somente após validação da legislação municipal.
 */
export function getHolidays(year: number, region: CalendarRegion): Holiday[] {
  const fixed: [string, string][] = [
    ['01-01', 'Confraternização Universal'],
    ['04-21', 'Tiradentes'],
    ['05-01', 'Dia do Trabalho'],
    ['09-07', 'Independência do Brasil'],
    ['10-12', 'Nossa Senhora Aparecida'],
    ['11-02', 'Finados'],
    ['11-15', 'Proclamação da República'],
    ['11-20', 'Consciência Negra'],
    ['12-25', 'Natal'],
  ]
  const holidays: Holiday[] = fixed.map(([day, name]) => ({
    date: `${year}-${day}`, name, level: 'Nacional',
  }))
  holidays.push({ date: offsetFromEaster(year, -2), name: 'Paixão de Cristo', level: 'Nacional' })

  if (region === 'SP' || region === 'SOROCABA') {
    holidays.push({ date: `${year}-07-09`, name: 'Revolução Constitucionalista', level: 'Estadual' })
  }
  if (region === 'SOROCABA') {
    holidays.push({ date: offsetFromEaster(year, 60), name: 'Corpus Christi', level: 'Municipal' })
    holidays.push({ date: `${year}-08-15`, name: 'Aniversário de Sorocaba', level: 'Municipal' })
  }
  return holidays.sort((a, b) => a.date.localeCompare(b.date))
}
