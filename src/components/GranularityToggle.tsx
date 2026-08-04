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

export function GranularityToggle({ value, onChange, maxLevel }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Time units</span>
      <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
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
