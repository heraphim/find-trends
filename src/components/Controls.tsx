import { METRICS, type Granularity } from '../lib/data'

const GRANULARITIES: Granularity[] = ['daily', 'weekly', 'monthly']

interface Props {
  metricKey: string
  granularity: Granularity
  onMetricChange: (key: string) => void
  onGranularityChange: (g: Granularity) => void
}

export function Controls({
  metricKey,
  granularity,
  onMetricChange,
  onGranularityChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-600 dark:text-slate-300">Metric</span>
        <select
          value={metricKey}
          onChange={(e) => onMetricChange(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
              {m.unit ? ` (${m.unit})` : ''}
            </option>
          ))}
        </select>
      </label>

      <div
        role="group"
        aria-label="Granularity"
        className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800"
      >
        {GRANULARITIES.map((g) => {
          const active = g === granularity
          return (
            <button
              key={g}
              type="button"
              onClick={() => onGranularityChange(g)}
              aria-pressed={active}
              className={
                'rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ' +
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
    </div>
  )
}
