import type { SalesStats } from '../lib/sales'

// A single weather reading for one city over the selected period.
export interface DayWeather {
  city: string
  items: { label: string; value: string }[]
}

interface Props {
  title: string // the selected period, e.g. "12 Mar 2024"
  stats: SalesStats | null // null → no checked datasets / no sales in range
  weather: DayWeather[]
  onClear?: () => void
}

function money(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  )
}

export function DayStatsCard({ title, stats, weather, onClear }: Props) {
  return (
    <section className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm dark:border-blue-500/30 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          Selected period
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
            {title}
          </span>
        </h2>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="rounded border border-slate-300 px-1.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            clear
          </button>
        )}
      </div>

      {stats ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Total money" value={money(stats.total)} />
          <Stat label="Purchases" value={stats.count.toLocaleString()} />
          <Stat label="Average purchase" value={money(stats.average)} />
          <Stat label="Lowest purchase" value={money(stats.min)} />
          <Stat label="Highest purchase" value={money(stats.max)} />
        </div>
      ) : (
        <p className="text-sm text-slate-400">
          No sales in this period — check a dataset in the Sales panel to see totals here.
        </p>
      )}

      {weather.length > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Weather</h3>
          <div className="flex flex-col gap-2">
            {weather.map((w) => (
              <div key={w.city} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">{w.city}</span>
                {w.items.map((it) => (
                  <span key={it.label} className="text-slate-500 dark:text-slate-400">
                    {it.label}:{' '}
                    <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">
                      {it.value}
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
