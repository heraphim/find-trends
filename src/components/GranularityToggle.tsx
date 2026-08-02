import type { Granularity } from '../lib/data'

const OPTIONS: Granularity[] = ['daily', 'weekly', 'monthly']

interface Props {
  value: Granularity
  onChange: (g: Granularity) => void
}

export function GranularityToggle({ value, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="Granularity"
      className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800"
    >
      {OPTIONS.map((g) => {
        const active = g === value
        return (
          <button
            key={g}
            type="button"
            onClick={() => onChange(g)}
            aria-pressed={active}
            className={
              'rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors ' +
              (active
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100')
            }
          >
            {g}
          </button>
        )
      })}
    </div>
  )
}
