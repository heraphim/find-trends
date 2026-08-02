import type { Metric, SeriesStats } from '../lib/data'

interface Props {
  stats: SeriesStats
  metric: Metric
  granularity: string
}

function Tile({
  label,
  value,
  unit,
}: {
  label: string
  value: number
  unit: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        {value}
        {unit && <span className="ml-1 text-base font-normal text-slate-400">{unit}</span>}
      </div>
    </div>
  )
}

export function StatTiles({ stats, metric, granularity }: Props) {
  const per = granularity === 'daily' ? 'day' : granularity === 'weekly' ? 'week' : 'month'
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Latest" value={stats.latest} unit={metric.unit} />
      <Tile label={`Average / ${per}`} value={stats.avg} unit={metric.unit} />
      <Tile label="Minimum" value={stats.min} unit={metric.unit} />
      <Tile label="Maximum" value={stats.max} unit={metric.unit} />
    </div>
  )
}
