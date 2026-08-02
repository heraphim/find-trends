import { useMemo, useState } from 'react'
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

export type RangeMode = 'day' | 'week' | 'month' | 'year' | 'all'

const MODES: { id: RangeMode; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All' },
]

interface Props {
  value: DateRange
  onChange: (r: DateRange) => void
  bounds: { min: Date; max: Date }
  mode: RangeMode
  onModeChange: (m: RangeMode) => void
}

const controlClass =
  'rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 [color-scheme:light] dark:[color-scheme:dark]'

export function DateRangePicker({ onChange, bounds, mode, onModeChange }: Props) {
  const [daySel, setDaySel] = useState<Date>(() => yesterday())
  const [weekSel, setWeekSel] = useState('recent')
  const [monthSel, setMonthSel] = useState('recent')
  const [yearSel, setYearSel] = useState('recent')

  const weeks = useMemo(() => weekOptions(bounds.min, bounds.max), [bounds])
  const months = useMemo(() => monthOptions(bounds.min, bounds.max), [bounds])
  const years = useMemo(() => yearOptions(bounds.min, bounds.max), [bounds])

  const clamp = (r: DateRange): DateRange => ({
    start: r.start.getTime() < bounds.min.getTime() ? new Date(bounds.min) : r.start,
    end: r.end.getTime() > bounds.max.getTime() ? new Date(bounds.max) : r.end,
  })
  const apply = (r: DateRange) => onChange(clamp(r))

  const selectMode = (m: RangeMode) => {
    onModeChange(m)
    if (m === 'day') apply({ start: daySel, end: daySel })
    else if (m === 'week') {
      setWeekSel('recent')
      apply(lastNDays(7))
    } else if (m === 'month') {
      setMonthSel('recent')
      apply(lastNDays(30))
    } else if (m === 'year') {
      setYearSel('recent')
      apply(lastNDays(365))
    } else apply({ start: new Date(bounds.min), end: new Date(bounds.max) })
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
                'rounded-md px-3 py-1 text-sm font-medium transition-colors ' +
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
              apply({ start: d, end: d })
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
            const k = e.target.value
            setWeekSel(k)
            if (k === 'recent') apply(lastNDays(7))
            else apply(weekRangeFromMonday(fromInputValue(k)!))
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
            const k = e.target.value
            setMonthSel(k)
            if (k === 'recent') apply(lastNDays(30))
            else {
              const [y, mo] = k.split('-').map(Number)
              apply(monthRangeOf(y, mo))
            }
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
            const k = e.target.value
            setYearSel(k)
            if (k === 'recent') apply(lastNDays(365))
            else apply(yearRangeOf(Number(k)))
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
