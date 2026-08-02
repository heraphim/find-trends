import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchSheetData } from '../lib/sheet'
import {
  aggregateMerged,
  type Granularity,
  type SeriesSpec,
} from '../lib/data'
import { metricMeta } from '../lib/metricMeta'
import {
  buildModel,
  categoriesForCity,
  discoverTabNames,
  parseTabName,
  type WorkbookModel,
} from '../lib/workbook'
import { seriesLabel } from '../lib/labels'
import { DEFAULT_SERIES_COLORS } from '../lib/chartColors'
import { lastNDays, today, type DateRange } from '../lib/dateRange'
import { fetchDayAttributes, type DayAttributes } from '../lib/dayFilters'
import { TabBar } from './TabBar'
import { Sidebar, type SheetState } from './Sidebar'
import { DayFilters } from './DayFilters'
import { GranularityToggle } from './GranularityToggle'
import { DateRangePicker } from './DateRangePicker'
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
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const [range, setRange] = useState<DateRange>(() => lastNDays(30))
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [colorById, setColorById] = useState<Record<string, string>>({})
  const [sheetStates, setSheetStates] = useState<Record<string, SheetState>>({})
  const [dayAttributes, setDayAttributes] = useState<DayAttributes | null>(null)
  const [filterState, setFilterState] = useState<Record<string, Set<string>>>({})

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

  // Load the per-day filter attributes from the days sheet.
  useEffect(() => {
    if (discovery.status !== 'ready' || !discovery.model.daysSheet) return
    let cancelled = false
    fetchDayAttributes(discovery.model.daysSheet)
      .then((attrs) => {
        if (cancelled) return
        setDayAttributes(attrs)
        // Default: every value in every dimension is checked (all days included).
        const init: Record<string, Set<string>> = {}
        for (const d of attrs.dimensions) init[d.column] = new Set(d.values)
        setFilterState(init)
      })
      .catch(() => {
        /* filters are optional — ignore load failure */
      })
    return () => {
      cancelled = true
    }
  }, [discovery])

  // Date bounds for the range selector (from the days sheet, or a fallback).
  const bounds = useMemo(() => {
    if (dayAttributes && dayAttributes.byDate.size > 0) {
      let min = Infinity
      let max = -Infinity
      for (const t of dayAttributes.byDate.keys()) {
        if (t < min) min = t
        if (t > max) max = t
      }
      return { min: new Date(min), max: new Date(max) }
    }
    return { min: new Date(2020, 0, 1), max: today() }
  }, [dayAttributes])

  const toggleFilterValue = useCallback((column: string, value: string) => {
    setFilterState((prev) => {
      const set = new Set(prev[column] ?? [])
      if (set.has(value)) set.delete(value)
      else set.add(value)
      return { ...prev, [column]: set }
    })
  }, [])

  // Set of date-epochs that pass all active day filters (null = no filtering).
  const allowedDates = useMemo(() => {
    if (!dayAttributes) return null
    const anyUnchecked = dayAttributes.dimensions.some(
      (d) => (filterState[d.column]?.size ?? d.values.length) < d.values.length,
    )
    if (!anyUnchecked) return null // all checked → include every day
    const allowed = new Set<number>()
    for (const [epoch, attrs] of dayAttributes.byDate) {
      let pass = true
      for (const d of dayAttributes.dimensions) {
        const checked = filterState[d.column]
        const val = attrs[d.column]
        if (checked && val !== undefined && !checked.has(val)) {
          pass = false
          break
        }
      }
      if (pass) allowed.add(epoch)
    }
    return allowed
  }, [dayAttributes, filterState])

  const categories = useMemo(() => {
    if (discovery.status !== 'ready' || !activeCity) return []
    return categoriesForCity(discovery.model, activeCity)
  }, [discovery, activeCity])

  // All valid sheet names (used to validate tab-switch remapping).
  const allSheetNames = useMemo(() => {
    const s = new Set<string>()
    if (discovery.status === 'ready') {
      for (const tabs of discovery.model.byCity.values()) for (const t of tabs) s.add(t.sheet)
      for (const t of discovery.model.global) s.add(t.sheet)
    }
    return s
  }, [discovery])

  // Switch city: remap city-specific selections to the new city's equivalent
  // sheet (e.g. Brasov rain → Sibiu rain); global selections stay put.
  const changeCity = useCallback(
    (newCity: string) => {
      if (newCity === activeCity) return
      const remapKey = (key: string): string | null => {
        const [sheet, col] = key.split('::')
        const tab = parseTabName(sheet)
        if (tab.city && tab.city === activeCity) {
          const target = `${newCity}-${tab.category}`
          return allSheetNames.has(target) ? `${target}::${col}` : null
        }
        return key
      }
      setSelected((prev) => {
        const next = new Set<string>()
        for (const k of prev) {
          const nk = remapKey(k)
          if (nk) next.add(nk)
        }
        return next
      })
      setColorById((prev) => {
        const next: Record<string, string> = {}
        for (const [k, c] of Object.entries(prev)) {
          const nk = remapKey(k)
          if (nk) next[nk] = c
        }
        return next
      })
      setActiveCity(newCity)
    },
    [activeCity, allSheetNames],
  )

  // Keep a distinct default color for every selected series; drop colors for
  // deselected ones.
  useEffect(() => {
    setColorById((prev) => {
      const next: Record<string, string> = {}
      const used = new Set<string>()
      for (const id of selected) {
        if (prev[id]) {
          next[id] = prev[id]
          used.add(prev[id])
        }
      }
      for (const id of selected) {
        if (!next[id]) {
          const free =
            DEFAULT_SERIES_COLORS.find((c) => !used.has(c)) ??
            DEFAULT_SERIES_COLORS[Object.keys(next).length % DEFAULT_SERIES_COLORS.length]
          next[id] = free
          used.add(free)
        }
      }
      return next
    })
  }, [selected])

  // Prune selections whose column doesn't exist in its (loaded) sheet — e.g.
  // Sibiu lacks Brasov's derived score columns after a tab switch.
  useEffect(() => {
    setSelected((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const key of prev) {
        const [sheet, col] = key.split('::')
        const st = sheetStates[sheet]
        if (
          st?.status === 'ready' &&
          !st.data.columns.some((c) => c.kind === 'metric' && c.key === col)
        ) {
          next.delete(key)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [sheetStates])

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
    const metricKeys = new Set(
      state.data.columns.filter((c) => c.kind === 'metric').map((c) => c.key),
    )
    let starters = ['sunshine_percentage', 'nice_day_score'].filter((k) => metricKeys.has(k))
    if (starters.length === 0) {
      const firstMetric = state.data.columns.find((c) => c.kind === 'metric')
      if (firstMetric) starters = [firstMetric.key]
    }
    if (starters.length) {
      setSelected(new Set(starters.map((k) => selKey(first, k))))
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

  const setSeriesColor = useCallback((id: string, color: string) => {
    setColorById((prev) => ({ ...prev, [id]: color }))
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
      return {
        id: key,
        sheet,
        column,
        label: seriesLabel(tab.city ?? tab.category, column),
        unit: metricMeta(column).unit,
      }
    })
  }, [selected])

  // Resolve each series' color (override or its distinct default by position).
  const resolvedColors = useMemo(() => {
    const map: Record<string, string> = {}
    series.forEach((s, i) => {
      map[s.id] = colorById[s.id] ?? DEFAULT_SERIES_COLORS[i % DEFAULT_SERIES_COLORS.length]
    })
    return map
  }, [series, colorById])

  const chartData = useMemo(() => {
    const inputs = series.flatMap((spec) => {
      const st = sheetStates[spec.sheet]
      if (st?.status !== 'ready') return []
      const rows = st.data.rows.filter(
        (r) =>
          r.date >= range.start &&
          r.date <= range.end &&
          (!allowedDates || allowedDates.has(r.date.getTime())),
      )
      return [{ spec, rows, meta: metricMeta(spec.column) }]
    })
    return aggregateMerged(inputs, granularity)
  }, [series, sheetStates, granularity, range, allowedDates])

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
      <TabBar cities={discovery.model.cities} active={activeCity} onChange={changeCity} />

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Chart area */}
        <section className="flex min-w-0 flex-1 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Trends</h2>
              <p className="text-xs text-slate-400">
                Actual values over the selected range.
              </p>
            </div>
            <GranularityToggle value={granularity} onChange={setGranularity} />
          </div>

          <DateRangePicker value={range} onChange={setRange} bounds={bounds} />

          {/* Selected chips — color picker + label + remove */}
          {series.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {series.map((s) => (
                <span
                  key={s.id}
                  className="group inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-1.5 pr-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <input
                    type="color"
                    aria-label={`Color for ${s.label}`}
                    title="Change color"
                    value={resolvedColors[s.id] ?? '#000000'}
                    onChange={(e) => setSeriesColor(s.id, e.target.value)}
                    className="h-4 w-4 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0"
                  />
                  {s.label}
                  <button
                    type="button"
                    onClick={() => toggleColumn(s.sheet, s.column)}
                    title="Remove"
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-100"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {series.length === 0 ? (
            <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 text-center text-sm text-slate-400 dark:border-slate-700">
              Pick metrics from the categories on the right to plot them.
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-96 items-center justify-center text-sm text-slate-400">
              Loading series…
            </div>
          ) : (
            <MultiTrendChart data={chartData} series={series} colorById={resolvedColors} />
          )}
        </section>

        {/* Right column: day filters + category sidebar */}
        <div className="flex w-full shrink-0 flex-col gap-4 md:w-72">
          {dayAttributes && (
            <DayFilters
              dimensions={dayAttributes.dimensions}
              state={filterState}
              onToggle={toggleFilterValue}
            />
          )}
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
    </div>
  )
}
