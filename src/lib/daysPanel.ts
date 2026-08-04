// State + filtering for the Days panel (the first per-CSV sidebar panel of the
// filtering rework). Each row is a days-sheet column; its checkbox opens the
// sub-control underneath. A row that is off (or whose sub-state is "everything
// checked") applies no filtering at all.

export interface DaysPanelState {
  holiday: { on: boolean; yes: boolean; no: boolean }
  weekday: { on: boolean; days: number[] } // 0 = Monday .. 6 = Sunday
  month: { on: boolean; months: number[] } // 0 = January .. 11 = December
  day: { on: boolean; lo: number; hi: number } // day-of-month arc, circular 1..31
}

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]
export const ALL_MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

// Opening a row always starts from "everything checked" (= no filtering), and
// closing it resets, so the row checkbox alone can never hide data.
export function defaultDaysPanel(): DaysPanelState {
  return {
    holiday: { on: false, yes: true, no: true },
    weekday: { on: false, days: [...ALL_WEEKDAYS] },
    month: { on: false, months: [...ALL_MONTHS] },
    day: { on: false, lo: 1, hi: 31 },
  }
}

// lo..hi walking clockwise (wraps past 31 → 1, so 25..5 = salary period).
export function dayInCircularRange(d: number, lo: number, hi: number): boolean {
  return lo <= hi ? d >= lo && d <= hi : d >= lo || d <= hi
}

// True when at least one row actually restricts the data.
export function daysPanelActive(s: DaysPanelState): boolean {
  return (
    (s.holiday.on && !(s.holiday.yes && s.holiday.no)) ||
    (s.weekday.on && s.weekday.days.length < 7) ||
    (s.month.on && s.month.months.length < 12) ||
    (s.day.on && !(s.day.lo === 1 && s.day.hi === 31))
  )
}

// Does this date pass every active row? Weekday/month/day derive from the date
// itself; holiday reads the days-sheet attributes for that date.
export function daysPanelAllows(
  s: DaysPanelState,
  epoch: number,
  attrs?: Record<string, string>,
): boolean {
  const d = new Date(epoch)
  if (s.weekday.on && s.weekday.days.length < 7) {
    if (!s.weekday.days.includes((d.getDay() + 6) % 7)) return false
  }
  if (s.month.on && s.month.months.length < 12) {
    if (!s.month.months.includes(d.getMonth())) return false
  }
  if (s.day.on && !(s.day.lo === 1 && s.day.hi === 31)) {
    if (!dayInCircularRange(d.getDate(), s.day.lo, s.day.hi)) return false
  }
  if (s.holiday.on && !(s.holiday.yes && s.holiday.no)) {
    // The days sheet stores Python-style booleans ("True"/"False") — compare
    // case-insensitively so a generator change to TRUE/true keeps working.
    const isHoliday = attrs?.['is_holiday']?.toLowerCase() === 'true'
    if (!(isHoliday ? s.holiday.yes : s.holiday.no)) return false
  }
  return true
}
