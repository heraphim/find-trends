import { useEffect, useMemo, useState } from 'react'
import { fetchSheetRows } from '../lib/sheet'
import {
  aggregate,
  computeStats,
  metricByKey,
  type DataRow,
  type Granularity,
} from '../lib/data'
import { Controls } from './Controls'
import { StatTiles } from './StatTiles'
import { TrendChart } from './TrendChart'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: DataRow[] }

export function Dashboard() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [metricKey, setMetricKey] = useState('temp_mean')
  const [granularity, setGranularity] = useState<Granularity>('monthly')

  useEffect(() => {
    let cancelled = false
    fetchSheetRows()
      .then((rows) => {
        if (!cancelled) setState({ status: 'ready', rows })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Failed to load data.',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const metric = metricByKey(metricKey)

  const points = useMemo(() => {
    if (state.status !== 'ready') return []
    return aggregate(state.rows, metric, granularity)
  }, [state, metric, granularity])

  const stats = useMemo(() => computeStats(points, metric.decimals), [points, metric])

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Weather trends</h2>
        {state.status === 'ready' && (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {state.rows.length.toLocaleString()} days from Google Sheets
          </span>
        )}
      </div>

      {state.status === 'loading' && (
        <div className="flex h-80 items-center justify-center text-slate-400">
          Loading data…
        </div>
      )}

      {state.status === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <Controls
            metricKey={metricKey}
            granularity={granularity}
            onMetricChange={setMetricKey}
            onGranularityChange={setGranularity}
          />
          {stats && <StatTiles stats={stats} metric={metric} granularity={granularity} />}
          <TrendChart points={points} metric={metric} />
        </>
      )}
    </section>
  )
}
