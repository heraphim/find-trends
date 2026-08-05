import type { Granularity } from '../lib/data'

// Ordered coarsening levels — index doubles as the level (day=0 … all=4).
export const GRANULARITY_ORDER: Granularity[] = ['day', 'week', 'month', 'year', 'all']

const LABELS: Record<Granularity, string> = {
  day: 'Days',
  week: 'Weeks',
  month: 'Months',
  year: 'Years',
  all: 'All',
}

interface Props {
  value: Granularity
  onChange: (g: Granularity) => void
  maxLevel: number // highest selectable level (aligns with the range mode)
}

const selectClass =
  'rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 [color-scheme:light] dark:[color-scheme:dark]'

export function GranularityToggle({ value, onChange, maxLevel }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Time units</span>
      {/* Compact select on mobile, buttons on md+ */}
      <select
        aria-label="Time units"
        className={selectClass + ' md:hidden'}
        value={value}
        onChange={(e) => onChange(e.target.value as Granularity)}
      >
        {GRANULARITY_ORDER.map((g, level) => (
          <option key={g} value={g} disabled={level > maxLevel}>
            {LABELS[g]}
          </option>
        ))}
      </select>
      <div className="hidden rounded-lg border border-slate-300 bg-slate-100 p-0.5 md:inline-flex dark:border-slate-700 dark:bg-slate-800">
        {GRANULARITY_ORDER.map((g, level) => {
          const active = g === value
          const disabled = level > maxLevel
          return (
            <button
              key={g}
              type="button"
              disabled={disabled}
              onClick={() => onChange(g)}
              aria-pressed={active}
              className={
                'rounded px-2 py-0.5 text-xs font-medium transition-colors ' +
                (disabled
                  ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
                  : active
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100')
              }
            >
              {LABELS[g]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
