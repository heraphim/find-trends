import type { SalesStats } from '../lib/sales'

// Sales + weather for one city over the selected period (one card column).
export interface CityDayStats {
  city: string
  stats: SalesStats | null // null → no sales for this city in the period
  weather: { label: string; value: string }[]
}

interface Props {
  title: string // the selected period, e.g. "12 Mar 2024"
  columns: CityDayStats[]
  onClear?: () => void
}

function money(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function list(vs: number[]): string {
  return vs.length ? vs.map(money).join(', ') : '—'
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  )
}

export function DayStatsCard({ title, columns, onClear }: Props) {
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

      {columns.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing to show for this period.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {columns.map((col) => (
            <div
              key={col.city}
              className="min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50"
            >
              <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{col.city}</div>

              {col.stats ? (
                <div className="flex flex-col text-sm">
                  <Row label="Total money" value={money(col.stats.total)} />
                  <Row label="Purchases" value={col.stats.count.toLocaleString()} />
                  <Row label="Average purchase" value={money(col.stats.average)} />
                  <Row label="Lowest 3" value={list(col.stats.low)} />
                  <Row label="Highest 3" value={list(col.stats.high)} />
                </div>
              ) : (
                <p className="text-xs text-slate-400">No sales this period.</p>
              )}

              {col.weather.length > 0 && (
                <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    {col.weather.map((it) => (
                      <span key={it.label} className="text-slate-500 dark:text-slate-400">
                        {it.label}:{' '}
                        <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">
                          {it.value}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
