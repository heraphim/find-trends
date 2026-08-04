import { useCallback, useMemo } from 'react'
import {
  fmtDayDash,
  fmtMonthYear,
  fromInputValue,
  lastNDays,
  monthOptions,
  monthRangeOf,
  toInputValue,
  weekOptions,
  weekRangeFromMonday,
  yearOptions,
  yearRangeOf,
  yesterday,
  type DateRange,
} from '../lib/dateRange'
import { usePersistedState } from '../hooks/usePersistedState'

const dateSerde = {
  serialize: (d: Date) => d.toISOString(),
  deserialize: (s: string) => new Date(s),
}

export type RangeMode = 'day' | 'week' | 'month' | 'year' | 'all'

const MODES: { id: RangeMode; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All' },
]

interface Props {
  onChange: (r: DateRange) => void
  bounds: { min: Date; max: Date }
  mode: RangeMode
  onModeChange: (m: RangeMode) => void
}

const controlClass =
  'rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 [color-scheme:light] dark:[color-scheme:dark]'

// The picker no longer *owns* the range — it's a preset input. Each mode button
// or sub-selection computes a range and hands it to onChange (which commits it to
// the time-history stack in Dashboard). The active range is the source of truth.
export function DateRangePicker({ onChange, bounds, mode, onModeChange }: Props) {
  // Persisted sub-selections — pure picker UI state (which control shows + its value).
  const [daySel, setDaySel] = usePersistedState<Date>('ft.daySel', () => yesterday(), dateSerde)
  const [weekSel, setWeekSel] = usePersistedState('ft.weekSel', 'recent')
  const [monthSel, setMonthSel] = usePersistedState('ft.monthSel', 'recent')
  const [yearSel, setYearSel] = usePersistedState('ft.yearSel', 'recent')

  const weeks = useMemo(() => weekOptions(bounds.min, bounds.max), [bounds])
  const months = useMemo(() => monthOptions(bounds.min, bounds.max), [bounds])
  const years = useMemo(() => yearOptions(bounds.min, bounds.max), [bounds])

  const clamp = useCallback(
    (r: DateRange): DateRange => ({
      start: r.start.getTime() < bounds.min.getTime() ? new Date(bounds.min) : r.start,
      end: r.end.getTime() > bounds.max.getTime() ? new Date(bounds.max) : r.end,
    }),
    [bounds],
  )

  // Compute the range for a mode + explicit sub-selection (no state-lag), clamped.
  const rangeFor = useCallback(
    (m: RangeMode, sel: { day?: Date; week?: string; month?: string; year?: string }): DateRange => {
      let r: DateRange
      if (m === 'day') r = { start: sel.day!, end: sel.day! }
      else if (m === 'week')
        r = sel.week === 'recent' ? lastNDays(7) : weekRangeFromMonday(fromInputValue(sel.week!)!)
      else if (m === 'month') {
        if (sel.month === 'recent') r = lastNDays(30)
        else {
          const [y, mo] = sel.month!.split('-').map(Number)
          r = monthRangeOf(y, mo)
        }
      } else if (m === 'year')
        r = sel.year === 'recent' ? lastNDays(365) : yearRangeOf(Number(sel.year))
      else r = { start: new Date(bounds.min), end: new Date(bounds.max) }
      return clamp(r)
    },
    [bounds, clamp],
  )

  // Switching mode resets that mode's sub-selection to "recent" and emits its range.
  const selectMode = (m: RangeMode) => {
    onModeChange(m)
    if (m === 'week') setWeekSel('recent')
    else if (m === 'month') setMonthSel('recent')
    else if (m === 'year') setYearSel('recent')
    onChange(rangeFor(m, { day: daySel, week: 'recent', month: 'recent', year: 'recent' }))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Range</span>
      {/* Mode buttons */}
      <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
        {MODES.map((m) => {
          const active = m.id === mode
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => selectMode(m.id)}
              aria-pressed={active}
              className={
                'rounded px-2 py-0.5 text-xs font-medium transition-colors ' +
                (active
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100')
              }
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {/* Per-mode control */}
      {mode === 'day' && (
        <input
          type="date"
          aria-label="Day"
          className={controlClass}
          value={toInputValue(daySel)}
          max={toInputValue(bounds.max)}
          min={toInputValue(bounds.min)}
          onChange={(e) => {
            const d = fromInputValue(e.target.value)
            if (d) {
              setDaySel(d)
              onChange(rangeFor('day', { day: d }))
            }
          }}
        />
      )}

      {mode === 'week' && (
        <select
          aria-label="Week"
          className={controlClass}
          value={weekSel}
          onChange={(e) => {
            setWeekSel(e.target.value)
            onChange(rangeFor('week', { week: e.target.value }))
          }}
        >
          <option value="recent">Last 7 days</option>
          {weeks.map((w) => (
            <option key={w.key} value={w.key}>
              Week {w.weekNum} - {fmtDayDash(w.start)}
            </option>
          ))}
        </select>
      )}

      {mode === 'month' && (
        <select
          aria-label="Month"
          className={controlClass}
          value={monthSel}
          onChange={(e) => {
            setMonthSel(e.target.value)
            onChange(rangeFor('month', { month: e.target.value }))
          }}
        >
          <option value="recent">Last 30 days</option>
          {months.map((m) => (
            <option key={m.key} value={m.key}>
              {fmtMonthYear(m.year, m.month)}
            </option>
          ))}
        </select>
      )}

      {mode === 'year' && (
        <select
          aria-label="Year"
          className={controlClass}
          value={yearSel}
          onChange={(e) => {
            setYearSel(e.target.value)
            onChange(rangeFor('year', { year: e.target.value }))
          }}
        >
          <option value="recent">Last 365 days</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
