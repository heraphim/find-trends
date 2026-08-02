export interface DateRange {
  start: Date
  end: Date // inclusive
}

// Local midnight of today (avoids UTC drift from `new Date()`).
export function today(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate())
}

export function monthToDate(): DateRange {
  const t = today()
  return { start: new Date(t.getFullYear(), t.getMonth(), 1), end: t }
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

export const EARLIEST = new Date(2015, 0, 1)

export interface Preset {
  label: string
  get: () => DateRange
}

export const PRESETS: Preset[] = [
  { label: 'MTD', get: monthToDate },
  { label: '30D', get: () => ({ start: addDays(today(), -29), end: today() }) },
  { label: '90D', get: () => ({ start: addDays(today(), -89), end: today() }) },
  { label: '12M', get: () => ({ start: addMonths(today(), -12), end: today() }) },
  { label: 'YTD', get: () => ({ start: new Date(today().getFullYear(), 0, 1), end: today() }) },
  { label: 'All', get: () => ({ start: EARLIEST, end: today() }) },
]

export function sameRange(a: DateRange, b: DateRange): boolean {
  return a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime()
}
