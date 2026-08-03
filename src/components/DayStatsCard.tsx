import type { SalesStats } from '../lib/sales'
import { useCollapsed } from '../hooks/useCollapsed'
import { CollapseChevron } from './CollapseChevron'

// Sales + weather glyph inputs for one city over the selected period (one column).
export interface CityDayStats {
  city: string
  stats: SalesStats | null // null → no sales for this city in the period
  weatherText: string // full weather summary, shown on the smiley's hover ('' if none)
  niceDay: number | null // nice-day score 0–100 → smiley
  rain: number | null // precipitation mm → rain icon
  snow: number | null // snowfall cm → snow icon
  money: { period: number; baseline: number } | null // day's takings vs the city's average day
}

interface Props {
  title: string // the selected period, e.g. "Tue, 12 Mar 2024"
  columns: CityDayStats[]
  onClear?: () => void
  onPrev?: () => void // step the selected period back one unit
  onNext?: () => void // step it forward one unit
}

function money(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function list(vs: number[]): string {
  return vs.length ? vs.map(money).join(', ') : '—'
}

// Nice-day score → a face from sad to happy.
function niceDayFace(score: number): string {
  if (score >= 80) return '😄'
  if (score >= 60) return '🙂'
  if (score >= 40) return '😐'
  if (score >= 20) return '🙁'
  return '😞'
}

function Glyph({ children, title }: { children: string; title: string }) {
  return (
    <span title={title} className="cursor-default text-base leading-none">
      {children}
    </span>
  )
}

// Money vs the city's average day: 💰 with 1/2/3 overlapping up/down arrows
// (small/medium/big change), coloured by direction.
function MoneyGlyph({ period, baseline }: { period: number; baseline: number }) {
  const pct = baseline !== 0 ? (period / baseline - 1) * 100 : 0
  const mag = Math.abs(pct)
  const count = mag >= 30 ? 3 : mag >= 15 ? 2 : mag >= 5 ? 1 : 0 // big / medium / small / ~flat
  const up = pct > 0
  const color = count === 0 ? '#94a3b8' : up ? '#16a34a' : '#dc2626'
  const arrows = count === 0 ? '≈' : (up ? '▲' : '▼').repeat(count)
  const level = ['about average', 'small', 'medium', 'big'][count]
  const sign = pct > 0 ? '+' : ''
  const title = `${money(period)}/day vs ${money(baseline)} average day (${sign}${pct.toFixed(0)}%${count ? `, ${up ? 'more' : 'less'} — ${level}` : ''})`
  return (
    <span title={title} className="inline-flex cursor-default items-center gap-0.5 text-base leading-none">
      💰
      <span
        style={{ color, letterSpacing: count > 1 ? '-0.4em' : undefined, paddingRight: count > 1 ? '0.4em' : undefined }}
        className="text-xs font-bold"
      >
        {arrows}
      </span>
    </span>
  )
}

function CityIcons({ col }: { col: CityDayStats }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {col.niceDay !== null && (
        <Glyph title={col.weatherText || `Nice-day score: ${col.niceDay.toFixed(0)}/100`}>
          {niceDayFace(col.niceDay)}
        </Glyph>
      )}
      {col.rain !== null && col.rain > 0 && (
        <Glyph title={`Rain: ${col.rain.toFixed(1)} mm`}>{col.rain >= 10 ? '🌧️' : '🌦️'}</Glyph>
      )}
      {col.snow !== null && col.snow > 0 && <Glyph title={`Snow: ${col.snow.toFixed(1)} cm`}>❄️</Glyph>}
      {col.money && <MoneyGlyph period={col.money.period} baseline={col.money.baseline} />}
    </span>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  )
}

export function DayStatsCard({ title, columns, onClear, onPrev, onNext }: Props) {
  const [collapsed, toggle] = useCollapsed('day-stats')

  // Combined totals across every city column (sales-bearing columns only).
  const totals = columns.reduce(
    (a, c) => (c.stats ? { total: a.total + c.stats.total, count: a.count + c.stats.count } : a),
    { total: 0, count: 0 },
  )
  const hasSales = columns.some((c) => c.stats)

  return (
    <section className="group rounded-2xl border border-blue-200 bg-white p-5 shadow-sm dark:border-blue-500/30 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CollapseChevron collapsed={collapsed} onClick={toggle} label="selected period" />
          Selected period
          {onPrev && (
            <button
              type="button"
              onClick={onPrev}
              title="Previous"
              className="rounded border border-slate-300 px-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ←
            </button>
          )}
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
            {title}
          </span>
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              title="Next"
              className="rounded border border-slate-300 px-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              →
            </button>
          )}
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

      {collapsed ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {hasSales ? (
            <>
              <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {money(totals.total)}
              </span>{' '}
              total ·{' '}
              <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {totals.count.toLocaleString()}
              </span>{' '}
              purchase{totals.count === 1 ? '' : 's'}
              {columns.length > 1 ? ` · ${columns.length} cities` : ''}
            </>
          ) : (
            'Weather only for this period.'
          )}
        </p>
      ) : columns.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing to show for this period.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {columns.map((col) => (
            <div
              key={col.city}
              className="min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{col.city}</span>
                <CityIcons col={col} />
              </div>

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
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
