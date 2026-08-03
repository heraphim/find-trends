import { capitalize } from '../lib/labels'
import { fmtDayDash } from '../lib/dateRange'
import type { DayFigure, PurchaseFigure, SalesDataset } from '../lib/sales'
import { useCollapsed } from '../hooks/useCollapsed'
import { CollapseChevron } from './CollapseChevron'

interface Props {
  datasets: SalesDataset[] // the SELECTED datasets (already filtered to ones with a summary)
  onJumpToDay: (t: number) => void // click a day-anchored figure → jump the chart range to that day
}

// "1,234 RON"
function money(v: number): string {
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} RON`
}

const kindLabel: Record<'weekday' | 'weekend', string> = { weekday: 'weekday', weekend: 'weekend' }

// A plain average row (not tied to a single day).
function AvgRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{money(value)}</span>
    </div>
  )
}

// A day-anchored figure: click to jump the chart to that day.
function DayRow({
  label,
  fig,
  onJump,
}: {
  label: string
  fig: DayFigure | PurchaseFigure
  onJump: (t: number) => void
}) {
  const amount = 'total' in fig ? fig.total : fig.amount
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      <button
        type="button"
        onClick={() => onJump(fig.t)}
        title={`Jump the chart to ${fmtDayDash(new Date(fig.t))}`}
        className="text-right font-semibold tabular-nums text-blue-600 hover:underline dark:text-blue-400"
      >
        {money(amount)}
        <span className="ml-1 font-normal text-slate-400">
          · {fmtDayDash(new Date(fig.t))} ({kindLabel[fig.kind]})
        </span>
      </button>
    </div>
  )
}

export function SalesSummaryPanel({ datasets, onJumpToDay }: Props) {
  const [collapsed, toggle] = useCollapsed('sales-summary')

  if (datasets.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CollapseChevron collapsed={collapsed} onClick={toggle} label="Sales summary" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sales summary</span>
        {collapsed && (
          <span className="text-xs text-slate-400">
            {datasets.length} dataset{datasets.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {!collapsed && (
        <div className="flex flex-wrap gap-3">
          {datasets.map((ds) => {
            const s = ds.summary
            return (
              <div
                key={ds.id}
                className="min-w-[240px] flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50"
              >
                <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {ds.city ? capitalize(ds.city) : ds.name}
                </div>
                <div className="flex flex-col text-sm">
                  <AvgRow label="Avg / day" value={s.avgPerDay} />
                  <AvgRow label="Avg weekday" value={s.avgWeekday} />
                  <AvgRow label="Avg weekend" value={s.avgWeekend} />
                  <AvgRow label="Avg / week" value={s.avgPerWeek} />
                  <AvgRow label="Avg / month" value={s.avgPerMonth} />
                  {s.bestDay && <DayRow label="Best day" fig={s.bestDay} onJump={onJumpToDay} />}
                  {s.bestDayOther && (
                    <DayRow
                      label={`Best ${kindLabel[s.bestDayOther.kind]}`}
                      fig={s.bestDayOther}
                      onJump={onJumpToDay}
                    />
                  )}
                  {s.biggestPurchase && (
                    <DayRow label="Biggest purchase" fig={s.biggestPurchase} onJump={onJumpToDay} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
