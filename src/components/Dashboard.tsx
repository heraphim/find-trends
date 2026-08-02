import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchSheetData } from '../lib/sheet'
import { aggregateMerged, type ChartRow, type Granularity, type SeriesSpec } from '../lib/data'
import { metricMeta } from '../lib/metricMeta'
import { buildModel, discoverTabNames, parseTabName, type WorkbookModel } from '../lib/workbook'
import { capitalize, prettyCategory, seriesLabel } from '../lib/labels'
import { DEFAULT_SERIES_COLORS } from '../lib/chartColors'
import { lastNDays, today, type DateRange } from '../lib/dateRange'
import { fetchDayAttributes, type DayAttributes } from '../lib/dayFilters'
import { CityControls } from './CityControls'
import { Sidebar, type SheetState, type SidebarCategory } from './Sidebar'
import { DayFilters } from './DayFilters'
import { GranularityToggle, GRANULARITY_ORDER } from './GranularityToggle'
import { DateRangePicker, type RangeMode } from './DateRangePicker'
import { MultiTrendChart } from './MultiTrendChart'

type SalesAgg = 'total' | 'average'

type Discovery =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; model: WorkbookModel }

interface ChartGroup {
  key: string
  title: string | null
  series: SeriesSpec[]
  data: ChartRow[]
}

export function Dashboard() {
  const [discovery, setDiscovery] = useState<Discovery>({ status: 'loading' })
  const [includedCities, setIncludedCities] = useState<Set<string>>(new Set())
  const [overlap, setOverlap] = useState(true)
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [rangeMode, setRangeMode] = useState<RangeMode>('month')
  const [salesAgg, setSalesAgg] = useState<SalesAgg>('total')
  const [range, setRange] = useState<DateRange>(() => lastNDays(30))
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // City-category selections keyed by `${category}::${column}`; globals by `${sheet}::${column}`.
  const [citySelections, setCitySelections] = useState<Set<string>>(
    () => new Set(['weather::nice_day_score']),
  )
  const [globalSelections, setGlobalSelections] = useState<Set<string>>(new Set())
  const [colorById, setColorById] = useState<Record<string, string>>({})
  const [sheetStates, setSheetStates] = useState<Record<string, SheetState>>({})
  const [dayAttributes, setDayAttributes] = useState<DayAttributes | null>(null)
  const [filterState, setFilterState] = useState<Record<string, Set<string>>>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const inFlight = useRef<Set<string>>(new Set())
  const didAutoExpand = useRef(false)

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

  // Discover the workbook on mount.
  useEffect(() => {
    let cancelled = false
    discoverTabNames()
      .then((names) => {
        if (cancelled) return
        const model = buildModel(names)
        setDiscovery({ status: 'ready', model })
        setIncludedCities(new Set(model.cities))
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
        const init: Record<string, Set<string>> = {}
        for (const d of attrs.dimensions) init[d.column] = new Set(d.values)
        setFilterState(init)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [discovery])

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

  const allowedDates = useMemo(() => {
    if (!dayAttributes) return null
    const anyUnchecked = dayAttributes.dimensions.some(
      (d) => (filterState[d.column]?.size ?? d.values.length) < d.values.length,
    )
    if (!anyUnchecked) return null
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

  // Distinct city-category names (e.g. ['weather']) and the set of valid sheets.
  const cityCatNames = useMemo(() => {
    const names: string[] = []
    if (discovery.status === 'ready') {
      for (const tabs of discovery.model.byCity.values()) {
        for (const t of tabs) if (!names.includes(t.category)) names.push(t.category)
      }
    }
    return names
  }, [discovery])

  const allSheetNames = useMemo(() => {
    const s = new Set<string>()
    if (discovery.status === 'ready') {
      for (const tabs of discovery.model.byCity.values()) for (const t of tabs) s.add(t.sheet)
      for (const t of discovery.model.global) s.add(t.sheet)
    }
    return s
  }, [discovery])

  // Load every included city's category sheets (for columns + data).
  useEffect(() => {
    for (const city of includedCities) {
      for (const cat of cityCatNames) {
        const sheet = `${city}-${cat}`
        if (allSheetNames.has(sheet)) loadSheet(sheet)
      }
    }
  }, [includedCities, cityCatNames, allSheetNames, loadSheet])

  // Load global sheets referenced by a selection.
  useEffect(() => {
    for (const key of globalSelections) loadSheet(key.split('::')[0])
  }, [globalSelections, loadSheet])

  // Auto-expand the first city category once.
  useEffect(() => {
    if (didAutoExpand.current || cityCatNames.length === 0) return
    setExpanded((prev) => (prev.size ? prev : new Set([cityCatNames[0]])))
    didAutoExpand.current = true
  }, [cityCatNames])

  // Categories for the sidebar: city categories (union across included cities) + globals.
  const categories = useMemo<SidebarCategory[]>(() => {
    if (discovery.status !== 'ready') return []
    const out: SidebarCategory[] = []

    for (const cat of cityCatNames) {
      const sheets = [...includedCities]
        .map((city) => `${city}-${cat}`)
        .filter((s) => allSheetNames.has(s))
      const states = sheets.map((s) => sheetStates[s])
      const anyReady = states.some((st) => st?.status === 'ready')
      // Union of columns (first-seen order), across ready included sheets.
      const seen = new Map<string, 'metric' | 'event'>()
      for (const s of sheets) {
        const st = sheetStates[s]
        if (st?.status === 'ready') {
          for (const c of st.data.columns) if (!seen.has(c.key)) seen.set(c.key, c.kind)
        }
      }
      out.push({
        key: cat,
        title: prettyCategory(cat),
        isGlobal: false,
        status: anyReady ? 'ready' : 'loading',
        metrics: [...seen].filter(([, k]) => k === 'metric').map(([c]) => c),
        events: [...seen].filter(([, k]) => k === 'event').map(([c]) => c),
      })
    }

    for (const t of discovery.model.global) {
      const st = sheetStates[t.sheet]
      out.push({
        key: t.sheet,
        title: prettyCategory(t.category),
        isGlobal: true,
        status:
          st?.status === 'ready' ? 'ready' : st?.status === 'error' ? 'error' : 'loading',
        message: st?.status === 'error' ? st.message : undefined,
        metrics:
          st?.status === 'ready' ? st.data.columns.filter((c) => c.kind === 'metric').map((c) => c.key) : [],
        events:
          st?.status === 'ready' ? st.data.columns.filter((c) => c.kind === 'event').map((c) => c.key) : [],
      })
    }
    return out
  }, [discovery, cityCatNames, includedCities, allSheetNames, sheetStates])

  const isColSelected = useCallback(
    (cat: SidebarCategory, col: string) =>
      cat.isGlobal
        ? globalSelections.has(`${cat.key}::${col}`)
        : citySelections.has(`${cat.key}::${col}`),
    [globalSelections, citySelections],
  )

  const selectedCount = useCallback(
    (cat: SidebarCategory) => cat.metrics.filter((c) => isColSelected(cat, c)).length,
    [isColSelected],
  )

  const toggleColumn = useCallback((cat: SidebarCategory, col: string) => {
    const key = `${cat.key}::${col}`
    const setter = cat.isGlobal ? setGlobalSelections : setCitySelections
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleExpand = useCallback(
    (catKey: string) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(catKey)) next.delete(catKey)
        else {
          next.add(catKey)
          if (cityCatNames.includes(catKey)) {
            for (const city of includedCities) loadSheet(`${city}-${catKey}`)
          } else loadSheet(catKey)
        }
        return next
      })
    },
    [cityCatNames, includedCities, loadSheet],
  )

  // Changing the range mode clamps the "show in chart" granularity so it can't
  // be coarser than the window (e.g. Week range → only Days/Weeks selectable).
  const changeRangeMode = useCallback((m: RangeMode) => {
    setRangeMode(m)
    const maxLevel = GRANULARITY_ORDER.indexOf(m)
    setGranularity((g) =>
      GRANULARITY_ORDER.indexOf(g) > maxLevel ? GRANULARITY_ORDER[maxLevel] : g,
    )
  }, [])

  const maxLevel = GRANULARITY_ORDER.indexOf(rangeMode)

  const toggleCity = useCallback((city: string) => {
    setIncludedCities((prev) => {
      const next = new Set(prev)
      if (next.has(city)) next.delete(city)
      else next.add(city)
      return next
    })
  }, [])

  const setSeriesColor = useCallback((id: string, color: string) => {
    setColorById((prev) => ({ ...prev, [id]: color }))
  }, [])

  // Concrete series: city selections × included cities that have the column, then globals.
  const series = useMemo<SeriesSpec[]>(() => {
    const out: SeriesSpec[] = []
    if (discovery.status !== 'ready') return out
    const cityList = discovery.model.cities.filter((c) => includedCities.has(c))

    for (const sel of citySelections) {
      const [cat, col] = sel.split('::')
      for (const city of cityList) {
        const sheet = `${city}-${cat}`
        const st = sheetStates[sheet]
        if (st?.status === 'ready' && st.data.columns.some((c) => c.kind === 'metric' && c.key === col)) {
          out.push({
            id: `${sheet}::${col}`,
            sheet,
            column: col,
            label: seriesLabel(city, col),
            unit: metricMeta(col).unit,
          })
        }
      }
    }
    for (const key of globalSelections) {
      const [sheet, col] = key.split('::')
      out.push({
        id: key,
        sheet,
        column: col,
        label: seriesLabel(parseTabName(sheet).category, col),
        unit: metricMeta(col).unit,
      })
    }
    return out
  }, [discovery, includedCities, citySelections, globalSelections, sheetStates])

  const resolvedColors = useMemo(() => {
    const map: Record<string, string> = {}
    series.forEach((s, i) => {
      map[s.id] = colorById[s.id] ?? DEFAULT_SERIES_COLORS[i % DEFAULT_SERIES_COLORS.length]
    })
    return map
  }, [series, colorById])

  // Remove a series: drop its underlying selection.
  const removeSeries = useCallback((s: SeriesSpec) => {
    const tab = parseTabName(s.sheet)
    if (tab.city) {
      setCitySelections((prev) => {
        const next = new Set(prev)
        next.delete(`${tab.category}::${s.column}`)
        return next
      })
    } else {
      setGlobalSelections((prev) => {
        const next = new Set(prev)
        next.delete(s.id)
        return next
      })
    }
  }, [])

  // Aggregate a set of series into one chart dataset (range + day filters applied).
  const buildData = useCallback(
    (specs: SeriesSpec[]): ChartRow[] => {
      const inputs = specs.flatMap((spec) => {
        const st = sheetStates[spec.sheet]
        if (st?.status !== 'ready') return []
        const rows = st.data.rows.filter(
          (r) =>
            r.date >= range.start &&
            r.date <= range.end &&
            (!allowedDates || allowedDates.has(r.date.getTime())),
        )
        // The total/average radio only governs sales data (added later); every
        // other metric always averages.
        const isSales = false
        const meta = {
          ...metricMeta(spec.column),
          agg: isSales && salesAgg === 'total' ? ('sum' as const) : ('avg' as const),
        }
        return [{ spec, rows, meta }]
      })
      return aggregateMerged(inputs, granularity)
    },
    [sheetStates, range, allowedDates, granularity, salesAgg],
  )

  const chartGroups = useMemo<ChartGroup[]>(() => {
    if (series.length === 0) return []
    if (overlap) return [{ key: 'all', title: null, series, data: buildData(series) }]

    const groups: ChartGroup[] = []
    if (discovery.status === 'ready') {
      for (const city of discovery.model.cities) {
        if (!includedCities.has(city)) continue
        const citySeries = series.filter((s) => parseTabName(s.sheet).city === city)
        if (citySeries.length) {
          groups.push({ key: city, title: capitalize(city), series: citySeries, data: buildData(citySeries) })
        }
      }
    }
    const globalSeries = series.filter((s) => parseTabName(s.sheet).city === null)
    if (globalSeries.length) {
      groups.push({ key: '__global__', title: 'Markets', series: globalSeries, data: buildData(globalSeries) })
    }
    return groups
  }, [series, overlap, buildData, discovery, includedCities])

  if (discovery.status === 'loading') {
    return <div className="py-20 text-center text-slate-400">Loading workbook…</div>
  }
  if (discovery.status === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {discovery.message}
      </div>
    )
  }

  const hasData = chartGroups.some((g) => g.data.length > 0)

  return (
    <div className="flex flex-col gap-4">
      {/* City include-checkboxes + overlap, and a mobile sidebar toggle */}
      <div className="flex items-stretch gap-3">
        <div className="min-w-0 flex-1">
          <CityControls
            cities={discovery.model.cities}
            included={includedCities}
            overlap={overlap}
            onToggleCity={toggleCity}
            onToggleOverlap={() => setOverlap((o) => !o)}
          />
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen((o) => !o)}
          className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 md:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          {sidebarOpen ? 'Close' : 'Metrics'}
        </button>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Chart area */}
        <section className="flex min-w-0 flex-1 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 className="text-lg font-semibold">Trends</h2>
            <p className="text-xs text-slate-400">Actual values over the selected range.</p>
          </div>

          <div className="flex flex-col gap-3">
            <DateRangePicker
              value={range}
              onChange={setRange}
              bounds={bounds}
              mode={rangeMode}
              onModeChange={changeRangeMode}
            />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <GranularityToggle
                value={granularity}
                onChange={setGranularity}
                maxLevel={maxLevel}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Values
                </span>
                <div className="inline-flex gap-3 text-sm">
                  {(['total', 'average'] as const).map((v) => (
                    <label
                      key={v}
                      className="flex cursor-pointer items-center gap-1.5"
                      title="Applies to sales data (coming soon); all other data averages"
                    >
                      <input
                        type="radio"
                        name="salesAgg"
                        checked={salesAgg === v}
                        onChange={() => setSalesAgg(v)}
                        className="accent-blue-600"
                      />
                      <span className="capitalize text-slate-600 dark:text-slate-300">{v}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

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
                    onClick={() => removeSeries(s)}
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
              Pick metrics from the categories to plot them.
            </div>
          ) : !hasData ? (
            <div className="flex h-96 items-center justify-center text-sm text-slate-400">
              Loading series…
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {chartGroups.map((g) => (
                <div key={g.key}>
                  {g.title && (
                    <h3 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                      {g.title}
                    </h3>
                  )}
                  <MultiTrendChart data={g.data} series={g.series} colorById={resolvedColors} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right column: day filters + category sidebar (closable on mobile) */}
        <div
          className={
            (sidebarOpen ? 'flex' : 'hidden') +
            ' w-full shrink-0 flex-col gap-4 md:flex md:w-72'
          }
        >
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
            isSelected={isColSelected}
            selectedCount={selectedCount}
            onToggleExpand={toggleExpand}
            onToggleColumn={toggleColumn}
          />
        </div>
      </div>
    </div>
  )
}
