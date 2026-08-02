export interface DateRange {
  start: Date
  end: Date // inclusive
}

// Local midnight of today (avoids UTC drift from `new Date()`).
export function today(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

export function yesterday(): Date {
  return addDays(today(), -1)
}

// Rolling window of the last n calendar days, inclusive of today.
export function lastNDays(n: number): DateRange {
  return { start: addDays(today(), -(n - 1)), end: today() }
}

// <input type="date"> uses yyyy-mm-dd in local terms.
export function toInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromInputValue(s: string): Date | null {
  const parts = s.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

// ---- week / month / year helpers ----

// Monday of the week containing d.
export function mondayOf(d: Date): Date {
  const offset = (d.getDay() + 6) % 7 // Mon = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset)
}

// ISO-8601 week number.
export function isoWeek(d: Date): number {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayNum = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - dayNum + 3) // Thursday of this week
  const firstThursday = new Date(date.getFullYear(), 0, 4)
  const fdn = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - fdn + 3)
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000))
}

export function weekRangeFromMonday(monday: Date): DateRange {
  return { start: monday, end: addDays(monday, 6) }
}

export function monthRangeOf(year: number, month: number): DateRange {
  return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0) }
}

export function yearRangeOf(year: number): DateRange {
  return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) }
}

// ---- option lists for the selectors (newest first) ----

export interface WeekOption {
  key: string // Monday as yyyy-mm-dd
  weekNum: number
  start: Date
}

export function weekOptions(min: Date, max: Date): WeekOption[] {
  const out: WeekOption[] = []
  const stop = mondayOf(min).getTime()
  let m = mondayOf(max)
  while (m.getTime() >= stop) {
    out.push({ key: toInputValue(m), weekNum: isoWeek(m), start: new Date(m) })
    m = addDays(m, -7)
  }
  return out
}

export interface MonthOption {
  key: string // `${year}-${month}` (month 0-based)
  year: number
  month: number
}

export function monthOptions(min: Date, max: Date): MonthOption[] {
  const out: MonthOption[] = []
  let y = max.getFullYear()
  let mo = max.getMonth()
  const stopY = min.getFullYear()
  const stopMo = min.getMonth()
  while (y > stopY || (y === stopY && mo >= stopMo)) {
    out.push({ key: `${y}-${mo}`, year: y, month: mo })
    mo -= 1
    if (mo < 0) {
      mo = 11
      y -= 1
    }
  }
  return out
}

export function yearOptions(min: Date, max: Date): number[] {
  const out: number[] = []
  for (let y = max.getFullYear(); y >= min.getFullYear(); y--) out.push(y)
  return out
}

// ---- labels ----

const dayDashFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

// "3-Aug-2026"
export function fmtDayDash(d: Date): string {
  return dayDashFmt.format(d).replace(/ /g, '-')
}

const monthNameFmt = new Intl.DateTimeFormat(undefined, { month: 'long' })

// "August - 2026"
export function fmtMonthYear(year: number, month: number): string {
  return `${monthNameFmt.format(new Date(year, month, 1))} - ${year}`
}
