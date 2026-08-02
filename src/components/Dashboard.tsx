import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchSheetData } from '../lib/sheet'
import {
  aggregateIndexed,
  type Granularity,
  type SeriesSpec,
} from '../lib/data'
import {
  buildModel,
  categoriesForCity,
  discoverTabNames,
  parseTabName,
  type WorkbookModel,
} from '../lib/workbook'
import { seriesLabel } from '../lib/labels'
import { TabBar } from './TabBar'
import { Sidebar, type SheetState } from './Sidebar'
import { GranularityToggle } from './GranularityToggle'
import { MultiTrendChart } from './MultiTrendChart'

type Discovery =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; model: WorkbookModel }

function selKey(sheet: string, column: string): string {
  return `${sheet}::${column}`
}

export function Dashboard() {
  const [discovery, setDiscovery] = useState<Discovery>({ status: 'loading' })
  const [activeCity, setActiveCity] = useState('')
  const [granularity, setGranularity] = useState<Granularity>('monthly')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sheetStates, setSheetStates] = useState<Record<string, SheetState>>({})

  const inFlight = useRef<Set<string>>(new Set())
  const didAutoSelect = useRef(false)

  // Lazily fetch a sheet's data once.
  const loadSheet = useCallback((sheet: string) => {
    if (inFlight.current.has(sheet)) return
    setSheetStates((prev) => {
      const cur = prev[sheet]
      if (cur && (cur.status === 'ready' || cur.status === 'loading')) return prev
      return { ...prev, [sheet]: { status: 'loading' } }
    })
    inFlight.current.add(sheet)
    fetchSheetData(sheet)
      .then((data) => setSheetStates((prev) => ({ ...prev, [sheet]: { status: 'ready', data } })))
      .catch((err: unknown) =>
        setSheetStates((prev) => ({
          ...prev,
          [sheet]: {
            status: 'error',
            message: err instanceof Error ? err.message : 'Failed to load.',
          },
        })),
      )
      .finally(() => inFlight.current.delete(sheet))
  }, [])

  // Discover tabs on mount.
  useEffect(() => {
    let cancelled = false
    discoverTabNames()
      .then((names) => {
        if (cancelled) return
        const model = buildModel(names)
        setDiscovery({ status: 'ready', model })
        setActiveCity(model.cities[0] ?? '')
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDiscovery({
            status: 'error',
            message: err instanceof Error ? err.message : 'Discovery failed.',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const categories = useMemo(() => {
    if (discovery.status !== 'ready' || !activeCity) return []
    return categoriesForCity(discovery.model, activeCity)
  }, [discovery, activeCity])

  // When the active city changes, auto-open + load its first (weather) category.
  useEffect(() => {
    if (categories.length === 0) return
    const first = categories[0].sheet
    setExpanded((prev) => (prev.has(first) ? prev : new Set(prev).add(first)))
    loadSheet(first)
  }, [categories, loadSheet])

  // Once the first sheet is ready, auto-select a starter metric so the chart
  // isn't empty on first load.
  useEffect(() => {
    if (didAutoSelect.current || categories.length === 0) return
    const first = categories[0].sheet
    const state = sheetStates[first]
    if (state?.status !== 'ready') return
    const starter =
      state.data.columns.find((c) => c.kind === 'metric' && c.key === 'temp_mean') ??
      state.data.columns.find((c) => c.kind === 'metric')
    if (starter) {
      setSelected(new Set([selKey(first, starter.key)]))
    }
    didAutoSelect.current = true
  }, [categories, sheetStates])

  // Make sure every selected series' sheet is loaded.
  useEffect(() => {
    for (const key of selected) {
      const sheet = key.split('::')[0]
      const st = sheetStates[sheet]
      if (!st || st.status === 'idle') loadSheet(sheet)
    }
  }, [selected, sheetStates, loadSheet])

  const toggleExpand = useCallback(
    (sheet: string) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(sheet)) next.delete(sheet)
        else {
          next.add(sheet)
          loadSheet(sheet)
        }
        return next
      })
    },
    [loadSheet],
  )

  const toggleColumn = useCallback((sheet: string, column: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      const key = selKey(sheet, column)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const getSheetState = useCallback(
    (sheet: string): SheetState => sheetStates[sheet] ?? { status: 'idle' },
    [sheetStates],
  )

  // Selected series specs (insertion order → stable colors).
  const series = useMemo<SeriesSpec[]>(() => {
    return [...selected].map((key) => {
      const [sheet, column] = key.split('::')
      const tab = parseTabName(sheet)
      return { id: key, sheet, column, label: seriesLabel(tab.city ?? tab.category, column) }
    })
  }, [selected])

  const chartData = useMemo(() => {
    const inputs = series.flatMap((spec) => {
      const st = sheetStates[spec.sheet]
      return st?.status === 'ready' ? [{ spec, rows: st.data.rows }] : []
    })
    return aggregateIndexed(inputs, granularity)
  }, [series, sheetStates, granularity])

  if (discovery.status === 'loading') {
    return <div className="py-20 text-center text-slate-400">Discovering tabs…</div>
  }
  if (discovery.status === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {discovery.message}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <TabBar cities={discovery.model.cities} active={activeCity} onChange={setActiveCity} />

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Chart area */}
        <section className="flex min-w-0 flex-1 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Indexed trends</h2>
              <p className="text-xs text-slate-400">
                Each series indexed to % change from the start of the range.
              </p>
            </div>
            <GranularityToggle value={granularity} onChange={setGranularity} />
          </div>

          {/* Selected chips */}
          {series.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {series.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleColumn(s.sheet, s.column)}
                  className="group inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  title="Remove"
                >
                  {s.label}
                  <span className="text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-100">
                    ✕
                  </span>
                </button>
              ))}
            </div>
          )}

          {series.length === 0 ? (
            <div className="flex h-96 items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 text-center text-sm text-slate-400 dark:border-slate-700">
              Pick metrics from the categories on the right to plot them (indexed to % change).
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-96 items-center justify-center text-sm text-slate-400">
              Loading series…
            </div>
          ) : (
            <MultiTrendChart data={chartData} series={series} />
          )}
        </section>

        {/* Sidebar */}
        <Sidebar
          categories={categories}
          expanded={expanded}
          getSheetState={getSheetState}
          selected={selected}
          onToggleExpand={toggleExpand}
          onToggleColumn={toggleColumn}
        />
      </div>
    </div>
  )
}
