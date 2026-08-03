import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchSheetData } from '../lib/sheet'
import {
  aggregateMerged,
  bucketDates,
  bucketRow,
  bucketSkeleton,
  bucketStart,
  bucketToRange,
  stepBucket,
  mergeRowsByT,
  rebaseToPercent,
  seriesCorrelations,
  type ChartRow,
  type DataRow,
  type Granularity,
  type PairCorrelation,
  type SeriesSpec,
} from '../lib/data'
import { columnMeta, metricMeta, type Tier as ColumnTier } from '../lib/metricMeta'
import { buildModel, discoverTabNames, parseTabName, type WorkbookModel } from '../lib/workbook'
import { capitalize, prettyCategory, seriesLabel } from '../lib/labels'
import { DEFAULT_SERIES_COLORS } from '../lib/chartColors'
import { lastNDays, today, toInputValue, fromInputValue, type DateRange } from '../lib/dateRange'
import { fetchDayAttributes, type DayAttributes } from '../lib/dayFilters'
import {
  eventTier,
  eventsInRange,
  fetchEventFile,
  filesForSelection,
  type CuratedEvent,
  type EventSource,
} from '../lib/eventsData'
import type { Tier } from '../lib/events'
import { usePersistedState, setSerde, setMapSerde } from '../hooks/usePersistedState'
import { FT_SYNC_EVENT } from '../lib/shareConfig'
import { useCollapsed } from '../hooks/useCollapsed'
import { CollapseChevron } from './CollapseChevron'
import {
  SALES_METRICS,
  SALES_SUMMARY_VERSION,
  buildSalesSeries,
  computeSalesSummary,
  meanDailyTotal,
  parseSalesFile,
  salesSelKey,
  salesSeriesId,
  salesStatsInRange,
  type SalesDataset,
  type SalesMetric,
} from '../lib/sales'
import { CityControls } from './CityControls'
import { type SheetState, type SidebarCategory } from './Sidebar'
import { CategoryBar } from './CategoryBar'
import { DayFilters } from './DayFilters'
import { SalesPanel } from './SalesPanel'
import { SalesSummaryPanel } from './SalesSummaryPanel'
import { DayStatsCard, type CityDayStats } from './DayStatsCard'
import { GranularityToggle, GRANULARITY_ORDER } from './GranularityToggle'
import { DateRangePicker, type RangeMode } from './DateRangePicker'
import { MultiTrendChart, type BucketEvent, type EventMarker } from './MultiTrendChart'
import { CuratedEventsPanel } from './CuratedEventsPanel'
import { EventsPanel } from './EventsPanel'

type SalesAgg = 'total' | 'average'

// Numeric weather fields surfaced in the selected-day stats card, in order.
const WEATHER_FIELDS: { key: string; label: string; unit: string; agg: 'avg' | 'sum' }[] = [
  { key: 'temp_mean', label: 'Temp', unit: '°C', agg: 'avg' },
  { key: 'temp_max', label: 'Max', unit: '°C', agg: 'avg' },
  { key: 'temp_min', label: 'Min', unit: '°C', agg: 'avg' },
  { key: 'precipitation', label: 'Precip', unit: 'mm', agg: 'sum' },
  { key: 'wind_max', label: 'Wind', unit: 'km/h', agg: 'avg' },
  { key: 'sunshine_percentage', label: 'Sunshine', unit: '%', agg: 'avg' },
  { key: 'nice_day_score_v2', label: 'Nice-day', unit: 'pts', agg: 'avg' },
]

// Summarize a city's weather over a range (averaging, or summing precipitation).
function summarizeWeather(rows: DataRow[], range: DateRange): { label: string; value: string }[] {
  const inRange = rows.filter((r) => r.date >= range.start && r.date <= range.end)
  if (inRange.length === 0) return []
  const out: { label: string; value: string }[] = []
  for (const f of WEATHER_FIELDS) {
    let sum = 0
    let count = 0
    for (const r of inRange) {
      const v = r.values[f.key]
      if (typeof v === 'number' && !Number.isNaN(v)) {
        sum += v
        count++
      }
    }
    if (count === 0) continue
    const val = f.agg === 'sum' ? sum : sum / count
    out.push({ label: f.label, value: `${val.toFixed(1)} ${f.unit}` })
  }
  return out
}

// Raw numeric inputs for the day card's weather glyphs (nice-day face, rain, snow).
function weatherGlyphInputs(
  rows: DataRow[],
  range: DateRange,
): { niceDay: number | null; rain: number | null; snow: number | null } {
  const inRange = rows.filter((r) => r.date >= range.start && r.date <= range.end)
  const agg = (key: string, mode: 'avg' | 'sum'): number | null => {
    let sum = 0
    let count = 0
    for (const r of inRange) {
      const v = r.values[key]
      if (typeof v === 'number' && !Number.isNaN(v)) {
        sum += v
        count++
      }
    }
    if (count === 0) return null
    return mode === 'sum' ? sum : sum / count
  }
  return { niceDay: agg('nice_day_score_v2', 'avg'), rain: agg('precipitation', 'sum'), snow: agg('snowfall', 'sum') }
}

const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const dayFmtWeekday = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
function periodLabel(range: DateRange): string {
  if (range.start.getTime() === range.end.getTime()) return dayFmtWeekday.format(range.start) // single day → weekday
  return `${dayFmt.format(range.start)} – ${dayFmt.format(range.end)}`
}

// Tier colours matching the chart's event markers (major/notable/minor).
const MARKER_COLOR: Record<Tier, string> = { major: '#dc2626', notable: '#d97706', minor: '#94a3b8' }

// Names the events drawn on the chart, split into multi-day ranges (shaded bands)
// and single-unit events (line markers), directly beneath the chart. Hovering an
// entry glows the matching marker on the chart (via onHover → hoveredMarkerKey).
function MarkerLegend({
  markers,
  onHover,
  hoveredKey,
}: {
  markers: EventMarker[]
  onHover?: (key: string | null) => void
  hoveredKey?: string | null
}) {
  if (markers.length === 0) return null
  const ranges = markers.filter((m) => m.startLabel !== m.endLabel)
  const singles = markers.filter((m) => m.startLabel === m.endLabel)
  const row = (label: string, items: EventMarker[]) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="shrink-0 font-medium text-slate-500 dark:text-slate-400">{label}</span>
      {items.map((m) => {
        const key = `${m.startLabel}|${m.endLabel}`
        return (
          <span
            key={key}
            onMouseEnter={() => onHover?.(key)}
            onMouseLeave={() => onHover?.(null)}
            className={
              'inline-flex cursor-default items-center gap-1.5 rounded px-1 -mx-1 transition-colors ' +
              (hoveredKey === key ? 'bg-slate-200 dark:bg-slate-700' : '')
            }
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: MARKER_COLOR[m.tier] }} />
            <span className="tabular-nums text-slate-400">
              {m.startLabel === m.endLabel ? m.startLabel : `${m.startLabel} – ${m.endLabel}`}
            </span>
            <span className="text-slate-600 dark:text-slate-300">{m.names.join(', ')}</span>
          </span>
        )
      })}
    </div>
  )
  return (
    <div className="mt-2 flex flex-col gap-1 text-xs">
      {ranges.length > 0 && row('Event ranges:', ranges)}
      {singles.length > 0 && row('Events:', singles)}
    </div>
  )
}

// Slide a date range by one granularity unit (day/week/month/year), preserving
// each bound's time-of-day so the [start 00:00 … end 23:59] window keeps its
// width. Used to pan the whole chart when stepping the selected period.
function shiftRangeByUnit(r: DateRange, g: Granularity, dir: 1 | -1): DateRange {
  const bump = (d: Date): Date => {
    const [h, m, s, ms] = [d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]
    if (g === 'year') return new Date(d.getFullYear() + dir, d.getMonth(), d.getDate(), h, m, s, ms)
    if (g === 'month') return new Date(d.getFullYear(), d.getMonth() + dir, d.getDate(), h, m, s, ms)
    if (g === 'week') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * dir, h, m, s, ms)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dir, h, m, s, ms)
  }
  return { start: bump(r.start), end: bump(r.end) }
}

// Collapse curated events into chart markers spanning start→end buckets (clamped
// to the visible range), keeping the strongest tier and collecting event names.
// Same start & end bucket → a single-bucket marker (rendered as a line).
const TIER_RANK: Record<Tier, number> = { minor: 0, notable: 1, major: 2 }
function buildMarkers(data: ChartRow[], events: CuratedEvent[], g: Granularity): EventMarker[] {
  if (data.length === 0) return []
  const labelByT = new Map<number, string>()
  let firstT = Infinity
  let lastT = -Infinity
  for (const r of data) {
    labelByT.set(r.t, r.label)
    if (r.t < firstT) firstT = r.t
    if (r.t > lastT) lastT = r.t
  }
  const acc = new Map<string, { startLabel: string; endLabel: string; tier: Tier; names: string[] }>()
  for (const ev of events) {
    let sT = bucketStart(ev.start, g).getTime()
    let eT = bucketStart(ev.end, g).getTime()
    if (eT < firstT || sT > lastT) continue // event doesn't overlap the visible buckets
    if (sT < firstT) sT = firstT
    if (eT > lastT) eT = lastT
    const startLabel = labelByT.get(sT)
    const endLabel = labelByT.get(eT)
    if (startLabel === undefined || endLabel === undefined) continue
    const key = startLabel === endLabel ? startLabel : `${startLabel} ${endLabel}`
    const tier = eventTier(ev.importance)
    const cur = acc.get(key)
    if (!cur) acc.set(key, { startLabel, endLabel, tier, names: [ev.name] })
    else {
      cur.names.push(ev.name)
      if (TIER_RANK[tier] > TIER_RANK[cur.tier]) cur.tier = tier
    }
  }
  return [...acc.values()]
}

// Drop hidden columns and order the rest primary-first (stable within a tier),
// so category dropdowns lead with the featured metrics.
const TIER_ORDER: Record<ColumnTier, number> = { primary: 0, advanced: 1, hidden: 2 }
function visibleCols(keys: string[]): string[] {
  return keys
    .filter((c) => columnMeta(c).tier !== 'hidden')
    .sort((a, b) => TIER_ORDER[columnMeta(a).tier] - TIER_ORDER[columnMeta(b).tier])
}

function corrLabel(r: number): string {
  const a = Math.abs(r)
  if (a < 0.2) return 'no clear relation'
  const strength = a < 0.4 ? 'weak' : a < 0.6 ? 'moderate' : a < 0.8 ? 'strong' : 'very strong'
  return `${strength} ${r > 0 ? 'positive' : 'negative'}`
}

type Discovery =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; model: WorkbookModel }

type ScaleMode = 'actual' | 'percent'

interface ChartGroup {
  key: string
  title: string | null
  series: SeriesSpec[] // line series
  barSeries: SeriesSpec[] // sales bars
  data: ChartRow[]
  correlations: PairCorrelation[]
}

// ---- Time source of truth: a history stack of {range, granularity} snapshots ----
//
// Range + Time unit are the app's single source of truth (see CLAUDE.md). They
// live together as a history stack: the newest entry is the current window, every
// range/unit change pushes a new snapshot (deduped, capped at TIME_HISTORY_MAX),
// and Back pops. Zoom is not a separate concept — it just commits a new range.

type TimeSnap = { range: DateRange; gran: Granularity }

const TIME_HISTORY_MAX = 10

// Persist as [startYmd, endYmd, gran] triples (local yyyy-mm-dd, no UTC drift).
const timeHistorySerde = {
  serialize: (h: TimeSnap[]) =>
    JSON.stringify(h.map((s) => [toInputValue(s.range.start), toInputValue(s.range.end), s.gran])),
  deserialize: (raw: string): TimeSnap[] =>
    (JSON.parse(raw) as [string, string, string][])
      .map(([s, e, g]) => ({
        range: { start: fromInputValue(s), end: fromInputValue(e) },
        gran: g as Granularity,
      }))
      .filter((s): s is TimeSnap => s.range.start !== null && s.range.end !== null),
}

// Coarsest granularity level (index into GRANULARITY_ORDER) sensible for a range's
// span, so the Time-unit toggle can't pick a unit coarser than the window.
const LEVEL_MIN_DAYS = [1, 7, 28, 365, 365] // day, week, month, year, all
function maxLevelForRange(r: DateRange): number {
  const spanDays = Math.round((r.end.getTime() - r.start.getTime()) / 86_400_000) + 1
  let level = 0
  for (let i = 1; i < LEVEL_MIN_DAYS.length; i++) if (spanDays >= LEVEL_MIN_DAYS[i]) level = i
  return level
}
function clampGran(g: Granularity, r: DateRange): Granularity {
  const max = maxLevelForRange(r)
  return GRANULARITY_ORDER.indexOf(g) > max ? GRANULARITY_ORDER[max] : g
}
function sameSnap(a: TimeSnap, b: TimeSnap): boolean {
  return (
    a.gran === b.gran &&
    a.range.start.getTime() === b.range.start.getTime() &&
    a.range.end.getTime() === b.range.end.getTime()
  )
}
const DEFAULT_SNAP = (): TimeSnap => ({ range: lastNDays(30), gran: 'day' })

// Wheel/pinch events closer together than this collapse into one history entry.
const GESTURE_COALESCE_MS = 500
function startOfDay(t: number): Date {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
// Zoom is just a range change: scale the window by `factor` (<1 = zoom in, >1 =
// zoom out) about an anchor at `anchorFraction` across the window (0 = start, 0.5
// = centre — the buttons' default, 1 = end — used by wheel/pinch to keep the point
// under the cursor fixed). Snapped to whole days and clamped to bounds.
function zoomRange(
  r: DateRange,
  factor: number,
  bounds: { min: Date; max: Date },
  anchorFraction = 0.5,
): DateRange {
  const s0 = r.start.getTime()
  const span = r.end.getTime() - s0
  const anchorT = s0 + anchorFraction * span
  const newSpan = span * factor
  const lo = startOfDay(bounds.min.getTime()).getTime()
  const hi = startOfDay(bounds.max.getTime()).getTime()
  let s = Math.max(startOfDay(anchorT - anchorFraction * newSpan).getTime(), lo)
  let e = Math.min(startOfDay(anchorT + (1 - anchorFraction) * newSpan).getTime(), hi)
  if (e < s) e = s
  return { start: new Date(s), end: new Date(e) }
}

// Horizontal pan: shift a window by `fraction` of its own span (grab-and-drag —
// `fraction` > 0 means the pointer was dragged right, which moves the content
// right, i.e. the window *back* in time), preserving the span and clamping to
// bounds. Always applied to the gesture's base range so the day-snapping doesn't
// swallow sub-day moves as they accumulate.
function panRange(base: DateRange, fraction: number, bounds: { min: Date; max: Date }): DateRange {
  const s0 = base.start.getTime()
  const e0 = base.end.getTime()
  const dt = -fraction * (e0 - s0)
  const lo = startOfDay(bounds.min.getTime()).getTime()
  const hi = startOfDay(bounds.max.getTime()).getTime()
  let s = s0 + dt
  let e = e0 + dt
  if (s < lo) {
    e += lo - s
    s = lo
  }
  if (e > hi) {
    s -= e - hi
    e = hi
  }
  if (s < lo) s = lo
  return { start: startOfDay(s), end: startOfDay(e) }
}

// The next finer time unit (day ← week ← month ← year ← all), or null at the floor.
function finerGran(g: Granularity): Granularity | null {
  const i = GRANULARITY_ORDER.indexOf(g)
  return i > 0 ? GRANULARITY_ORDER[i - 1] : null
}
// Does the window cover just a single bucket at this granularity? ("one unit on
// the screen" — the point at which zoom-in switches to a finer unit instead.)
function spansOneBucket(r: DateRange, g: Granularity): boolean {
  if (g === 'all') return true
  return bucketStart(r.start, g).getTime() === bucketStart(r.end, g).getTime()
}
// Clamp a range to the zoom bounds (whole days).
function clampRange(r: DateRange, zb: { min: Date; max: Date }): DateRange {
  const lo = startOfDay(zb.min.getTime())
  const hi = startOfDay(zb.max.getTime())
  const s = r.start.getTime() < lo.getTime() ? lo : r.start
  const e = r.end.getTime() > hi.getTime() ? hi : r.end
  return e.getTime() < s.getTime() ? { start: s, end: s } : { start: s, end: e }
}
// Zoom-in step: shrink the window about `anchor` until only ONE unit fills the
// screen — snapping to that unit's full span so it reads cleanly — then the next
// zoom-in switches to the finer unit (day ← week ← month ← year ← all) instead of
// shrinking further. At the floor (one day at day units) it's a no-op.
function zoomInSnap(
  cur: TimeSnap,
  factor: number,
  anchor: number,
  zb: { min: Date; max: Date },
): TimeSnap {
  if (spansOneBucket(cur.range, cur.gran)) {
    const finer = finerGran(cur.gran)
    return finer ? { range: cur.range, gran: finer } : cur
  }
  const shrunk = zoomRange(cur.range, factor, zb, anchor)
  if (cur.gran !== 'all') {
    const shrunkDays = Math.round((shrunk.end.getTime() - shrunk.start.getTime()) / 86_400_000) + 1
    const minDays = LEVEL_MIN_DAYS[GRANULARITY_ORDER.indexOf(cur.gran)]
    // Landed inside a single unit — or shrank too small to hold a full one (a
    // window straddling a unit boundary can dip under it without ever spanning
    // exactly one bucket) → snap to the whole unit at the anchor point, so the
    // "one unit on screen" state is always reached before drilling finer.
    if (spansOneBucket(shrunk, cur.gran) || shrunkDays < minDays) {
      const anchorT = cur.range.start.getTime() + anchor * (cur.range.end.getTime() - cur.range.start.getTime())
      const full = bucketToRange(bucketStart(new Date(anchorT), cur.gran).getTime(), cur.gran)
      if (full) return { range: clampRange(full, zb), gran: cur.gran }
    }
  }
  return { range: shrunk, gran: cur.gran }
}
// Zoom-out step: grow the window about `anchor` (clamped to the zoom bounds),
// keeping the unit.
function zoomOutSnap(
  cur: TimeSnap,
  factor: number,
  anchor: number,
  zb: { min: Date; max: Date },
): TimeSnap {
  return { range: zoomRange(cur.range, factor, zb, anchor), gran: cur.gran }
}

export function Dashboard() {
  const [discovery, setDiscovery] = useState<Discovery>({ status: 'loading' })
  // Persisted config — survives reloads (see usePersistedState).
  const [includedCities, setIncludedCities] = usePersistedState('ft.cities', new Set<string>(), setSerde)
  const [overlap, setOverlap] = usePersistedState('ft.overlap', true)
  const [scaleMode, setScaleMode] = usePersistedState<ScaleMode>('ft.scale', 'actual')
  const [rangeMode, setRangeMode] = usePersistedState<RangeMode>('ft.rangeMode', 'month')
  const [salesAgg, setSalesAgg] = usePersistedState<SalesAgg>('ft.salesAgg', 'total')
  // The single source of truth for the time window: a history stack of
  // {range, granularity} snapshots (newest = current). Every range/unit change
  // pushes (deduped, capped at TIME_HISTORY_MAX); Back pops. Persisted so a
  // shared/imported view reproduces the exact window and its history.
  const [timeHistory, setTimeHistory] = usePersistedState<TimeSnap[]>(
    'ft.timeHistory',
    () => [DEFAULT_SNAP()],
    timeHistorySerde,
  )
  const current = timeHistory[timeHistory.length - 1] ?? DEFAULT_SNAP()
  const activeRange = current.range
  const granularity = current.gran
  const [eventSources, setEventSources] = usePersistedState('ft.eventSources', new Set<string>(), setSerde)
  const [eventData, setEventData] = useState<Record<string, CuratedEvent[]>>({})
  // City-category selections keyed by `${category}::${column}`; globals by `${sheet}::${column}`.
  const [citySelections, setCitySelections] = usePersistedState(
    'ft.citySel',
    new Set(['weather::nice_day_score_v2']),
    setSerde,
  )
  const [globalSelections, setGlobalSelections] = usePersistedState('ft.globalSel', new Set<string>(), setSerde)
  // Uploaded sales datasets + which of their metrics are plotted (`${dsId}::${metric}`).
  const [salesDatasets, setSalesDatasets] = usePersistedState<SalesDataset[]>('ft.sales', [])
  // Always-current mirror so the upload handler can decide merge-vs-add without a
  // stale closure (and stays correct across a same-tick multi-file upload).
  const salesDatasetsRef = useRef(salesDatasets)
  salesDatasetsRef.current = salesDatasets
  const [salesSelections, setSalesSelections] = usePersistedState('ft.salesSel', new Set<string>(), setSerde)
  const [colorById, setColorById] = usePersistedState<Record<string, string>>('ft.colors', {})
  const [sheetStates, setSheetStates] = useState<Record<string, SheetState>>({})
  const [dayAttributes, setDayAttributes] = useState<DayAttributes | null>(null)
  const [filterState, setFilterState] = usePersistedState<Record<string, Set<string>>>(
    'ft.filters',
    {},
    setMapSerde,
  )
  // A clicked chart point focuses the events panel + stats card on that bucket;
  // null means the whole active range (the Selected-period card is never empty).
  // Focus is reset to null on every range/unit change (baked into commitTime),
  // except Next/Prev which commit a fresh edge focus alongside the slid range.
  const [focusedT, setFocusedT] = useState<number | null>(null)
  // Event-legend hover → glow the matching marker on the chart.
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null)
  // Collapse the whole Trends chart section (controls + chart).
  const [chartCollapsed, toggleChart] = useCollapsed('trends')

  const inFlight = useRef<Set<string>>(new Set())
  const eventInFlight = useRef<Set<string>>(new Set())

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

  // An imported config snaps the whole time window (via FT_SYNC_EVENT); drop any
  // stale focus so the Selected-period card reflects the newly-applied range.
  useEffect(() => {
    const reset = () => setFocusedT(null)
    window.addEventListener(FT_SYNC_EVENT, reset)
    return () => window.removeEventListener(FT_SYNC_EVENT, reset)
  }, [])

  // Discover the workbook on mount.
  useEffect(() => {
    let cancelled = false
    discoverTabNames()
      .then((names) => {
        if (cancelled) return
        const model = buildModel(names)
        setDiscovery({ status: 'ready', model })
        // Default to all cities only if nothing was restored from storage.
        setIncludedCities((prev) => (prev.size > 0 ? prev : new Set(model.cities)))
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
        // Default every filter value to checked, unless restored from storage.
        setFilterState((prev) => {
          if (Object.keys(prev).length > 0) return prev
          const init: Record<string, Set<string>> = {}
          for (const d of attrs.dimensions) init[d.column] = new Set(d.values)
          return init
        })
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

  // Files backing the selected event sources ('local' resolves to included cities).
  const neededEventFiles = useMemo(
    () => filesForSelection(eventSources, includedCities),
    [eventSources, includedCities],
  )

  // Lazily fetch each needed curated-events file once.
  useEffect(() => {
    for (const spec of neededEventFiles) {
      if (eventData[spec.file] || eventInFlight.current.has(spec.file)) continue
      eventInFlight.current.add(spec.file)
      fetchEventFile(spec)
        .then((evs) => setEventData((p) => ({ ...p, [spec.file]: evs })))
        .catch(() => {})
        .finally(() => eventInFlight.current.delete(spec.file))
    }
  }, [neededEventFiles, eventData])

  const toggleEventSource = useCallback((s: EventSource) => {
    setEventSources((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }, [])

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
        metrics: visibleCols([...seen].filter(([, k]) => k === 'metric').map(([c]) => c)),
        events: visibleCols([...seen].filter(([, k]) => k === 'event').map(([c]) => c)),
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
          st?.status === 'ready'
            ? visibleCols(st.data.columns.filter((c) => c.kind === 'metric').map((c) => c.key))
            : [],
        events:
          st?.status === 'ready'
            ? visibleCols(st.data.columns.filter((c) => c.kind === 'event').map((c) => c.key))
            : [],
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

  // Opening a category's dropdown lazily loads its sheet(s).
  const onOpenCategory = useCallback(
    (catKey: string) => {
      if (cityCatNames.includes(catKey)) {
        for (const city of includedCities) loadSheet(`${city}-${catKey}`)
      } else loadSheet(catKey)
    },
    [cityCatNames, includedCities, loadSheet],
  )

  // Commit a new time-state snapshot: derive it from the current one, clamp the
  // granularity to the range's span, dedupe (no repeats in the stack), cap the
  // history at TIME_HISTORY_MAX (drop oldest), and set the focus — null for a
  // plain range/unit change, or an edge bucket for a Next/Prev step.
  const commitTime = useCallback(
    (next: (cur: TimeSnap) => TimeSnap, focus: number | null = null, opts?: { replace?: boolean }) => {
      setTimeHistory((h) => {
        const cur = h[h.length - 1] ?? DEFAULT_SNAP()
        const raw = next(cur)
        const snap: TimeSnap = { range: raw.range, gran: clampGran(raw.gran, raw.range) }
        // `replace` swaps the top in place instead of pushing — used by continuous
        // gestures (wheel/pinch/drag) so one gesture is a single history entry
        // rather than dozens. The base for the pushed-then-replaced entry is the
        // pre-gesture snapshot, so Back still lands where the gesture began.
        if (opts?.replace) {
          const rest = h.slice(0, -1).filter((s) => !sameSnap(s, snap))
          const appended = [...rest, snap]
          return appended.length > TIME_HISTORY_MAX ? appended.slice(appended.length - TIME_HISTORY_MAX) : appended
        }
        if (sameSnap(cur, snap)) return h
        const deduped = h.filter((s) => !sameSnap(s, snap))
        const appended = [...deduped, snap]
        return appended.length > TIME_HISTORY_MAX
          ? appended.slice(appended.length - TIME_HISTORY_MAX)
          : appended
      })
      setFocusedT(focus)
    },
    [setTimeHistory],
  )

  // Back: pop the top snapshot (undo the last range/unit change); focus resets.
  const back = useCallback(() => {
    setTimeHistory((h) => (h.length > 1 ? h.slice(0, -1) : h))
    setFocusedT(null)
  }, [setTimeHistory])

  // Coarsest selectable Time unit follows the active range's span, not a mode.
  const maxLevel = maxLevelForRange(activeRange)

  // The picker emits a new base range; keep the current (clamped) granularity.
  const setRangeFromPicker = useCallback(
    (r: DateRange) => commitTime((cur) => ({ range: r, gran: cur.gran })),
    [commitTime],
  )

  const changeGranularity = useCallback(
    (g: Granularity) => commitTime((cur) => ({ range: cur.range, gran: g })),
    [commitTime],
  )

  // Drag-zoom on the chart: commit the dragged bucket span as the new range.
  const zoomTo = useCallback(
    (startT: number, endT: number) => {
      const start = bucketToRange(startT, granularity)?.start ?? new Date(startT)
      const end = bucketToRange(endT, granularity)?.end ?? new Date(endT)
      commitTime((cur) => ({ range: { start, end }, gran: cur.gran }))
    },
    [commitTime, granularity],
  )

  // (Zoom in/out + gesture callbacks are defined below, after dataExtent, so
  //  their bounds can follow the sales data — see zoomBounds.)

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

  // Parse an uploaded workbook. Same-city uploads MERGE into the existing dataset
  // (concat + re-sort, summary recomputed) rather than adding a second entity; a
  // brand-new dataset is added with only its Amount metric checked.
  const handleUploadSales = useCallback(async (file: File) => {
    const ds = await parseSalesFile(file)
    const existing = ds.city ? salesDatasetsRef.current.find((d) => d.city === ds.city) : undefined
    if (existing) {
      // Merge into the existing city dataset: concat + re-sort, recompute summary,
      // keep its id (so selections/colors stay valid) and its existing checks.
      const tx = [...existing.tx, ...ds.tx].sort((a, b) => a[0] - b[0])
      setSalesDatasets((prev) =>
        prev.map((d) => (d.id === existing.id ? { ...d, tx, summary: computeSalesSummary(tx) } : d)),
      )
    } else {
      // Brand-new dataset (already carries its summary): add it, check Amount only.
      setSalesDatasets((prev) => [...prev, ds])
      setSalesSelections((prev) => {
        const next = new Set(prev)
        next.add(salesSelKey(ds.id, 'amount'))
        return next
      })
    }
  }, [])

  const removeSalesDataset = useCallback((id: string) => {
    setSalesDatasets((prev) => prev.filter((d) => d.id !== id))
    setSalesSelections((prev) => {
      const next = new Set<string>()
      for (const key of prev) if (!key.startsWith(`${id}::`)) next.add(key)
      return next
    })
  }, [])

  const toggleSalesMetric = useCallback((dsId: string, metric: SalesMetric) => {
    setSalesSelections((prev) => {
      const key = salesSelKey(dsId, metric)
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // Backfill summaries for datasets persisted before this shipped (or after a
  // version bump). Runs once per stale set; writes back so it isn't recomputed.
  useEffect(() => {
    if (!salesDatasets.some((d) => d.summary?.version !== SALES_SUMMARY_VERSION)) return
    setSalesDatasets((prev) =>
      prev.map((d) =>
        d.summary?.version === SALES_SUMMARY_VERSION ? d : { ...d, summary: computeSalesSummary(d.tx) },
      ),
    )
  }, [salesDatasets, setSalesDatasets])

  // Click a summary figure → jump the chart range to that single day.
  const jumpToDay = useCallback(
    (t: number) => {
      const d = new Date(t)
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      commitTime(() => ({ range: { start: day, end: day }, gran: 'day' }))
    },
    [commitTime],
  )

  // Datasets with at least one metric checked (drives the chart + stats card).
  const checkedDatasets = useMemo(
    () => salesDatasets.filter((d) => SALES_METRICS.some((m) => salesSelections.has(salesSelKey(d.id, m)))),
    [salesDatasets, salesSelections],
  )

  // A dataset only plots if its shop city is currently selected (included).
  const datasetVisible = useCallback(
    (ds: SalesDataset) => !!ds.city && includedCities.has(ds.city),
    [includedCities],
  )

  // Selected sales series ids (visible cities only), stable order for colors.
  const salesSeriesIds = useMemo(() => {
    const ids: string[] = []
    for (const ds of salesDatasets) {
      if (!datasetVisible(ds)) continue
      for (const m of SALES_METRICS) if (salesSelections.has(salesSelKey(ds.id, m))) ids.push(salesSeriesId(ds.id, m))
    }
    return ids
  }, [salesDatasets, salesSelections, datasetVisible])

  // Eagerly load each shop city's weather so the stats card has data ready.
  useEffect(() => {
    for (const ds of salesDatasets) {
      if (ds.city && allSheetNames.has(`${ds.city}-weather`)) loadSheet(`${ds.city}-weather`)
    }
  }, [salesDatasets, allSheetNames, loadSheet])

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
            label: seriesLabel(city, metricMeta(col).label),
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
        label: seriesLabel(parseTabName(sheet).category, metricMeta(col).label),
        unit: metricMeta(col).unit,
      })
    }
    return out
  }, [discovery, includedCities, citySelections, globalSelections, sheetStates])

  const resolvedColors = useMemo(() => {
    const map: Record<string, string> = {}
    const ids = [...series.map((s) => s.id), ...salesSeriesIds]
    ids.forEach((id, i) => {
      map[id] = colorById[id] ?? DEFAULT_SERIES_COLORS[i % DEFAULT_SERIES_COLORS.length]
    })
    return map
  }, [series, salesSeriesIds, colorById])

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
            r.date >= activeRange.start &&
            r.date <= activeRange.end &&
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
    [sheetStates, activeRange, allowedDates, granularity, salesAgg],
  )

  // Days (from the days sheet) that fall in the range AND pass the day filters.
  const matchingDays = useMemo(() => {
    if (!dayAttributes) return null
    const startT = activeRange.start.getTime()
    const endT = activeRange.end.getTime()
    const out: Date[] = []
    for (const t of dayAttributes.byDate.keys()) {
      if (t < startT || t > endT) continue
      if (allowedDates && !allowedDates.has(t)) continue
      out.push(new Date(t))
    }
    return out
  }, [dayAttributes, activeRange, allowedDates])

  const dayCountByT = useMemo(
    () => (matchingDays ? bucketDates(matchingDays, granularity) : null),
    [matchingDays, granularity],
  )

  // Empty header rows for every in-range bucket that passes the day filters, so a
  // chart's time axis spans the whole selected range even when the only content
  // is sparse (sales bars land on sale days only; event markers must anchor to a
  // bucket). Mirrors buildData's filter logic: allowedDates === null means no day
  // filter, so every calendar bucket in range is present.
  const rangeSkeleton = useMemo<ChartRow[]>(() => {
    if (!allowedDates) return bucketSkeleton(activeRange, granularity)
    const map = new Map<number, ChartRow>()
    const startT = activeRange.start.getTime()
    const endT = activeRange.end.getTime()
    for (const epoch of allowedDates) {
      if (epoch < startT || epoch > endT) continue
      const bs = bucketStart(new Date(epoch), granularity)
      const t = bs.getTime()
      if (!map.has(t)) map.set(t, bucketRow(bs, granularity))
    }
    return [...map.values()].sort((a, b) => a.t - b.t)
  }, [allowedDates, activeRange, granularity])
  const totalMatchingDays = matchingDays?.length ?? null

  // Attach each bucket's matching-day count so the tooltip can report it.
  const withDayCounts = useCallback(
    (rows: ChartRow[]): ChartRow[] =>
      dayCountByT ? rows.map((r) => ({ ...r, _days: dayCountByT.get(r.t) ?? 0 })) : rows,
    [dayCountByT],
  )

  // Build one group's chart: line data (actual, for scale-free correlation) then
  // rebased to % if active, with the group's sales bars merged onto the same time
  // axis. Sales bars stay in actual units (their own hidden axis), so the % scale
  // only rebases the lines. Correlation includes sales *amount* vs the lines.
  const makeGroup = useCallback(
    (key: string, title: string | null, specs: SeriesSpec[], datasets: SalesDataset[]): ChartGroup => {
      const lineActual = buildData(specs)
      const sales = buildSalesSeries(datasets, salesSelections, activeRange, allowedDates, granularity)
      const amountBars = sales.series.filter((s) => s.column === 'amount')
      const correlations = seriesCorrelations(mergeRowsByT(lineActual, sales.rows), [...specs, ...amountBars])
      const displayLine =
        scaleMode === 'percent' ? rebaseToPercent(lineActual, specs.map((s) => s.id)) : lineActual
      // Start from the range skeleton so the time axis is complete even when the
      // only series is sparse sales bars — otherwise event markers (and the axis
      // itself) would collapse to just the days that happened to have a sale.
      const merged = mergeRowsByT(displayLine, sales.rows)
      const data = withDayCounts(mergeRowsByT(rangeSkeleton, merged))
      return { key, title, series: specs, barSeries: sales.series, data, correlations }
    },
    [withDayCounts, buildData, scaleMode, salesSelections, activeRange, allowedDates, granularity, rangeSkeleton],
  )

  // Focus is a single clicked bucket, else the whole active range — so the
  // Selected-period card + events panels always show *something*. (Range/unit
  // changes reset focusedT to null inside commitTime, so this tracks the window.)
  const focusedRange = (focusedT !== null ? bucketToRange(focusedT, granularity) : null) ?? activeRange
  const focused = focusedT !== null
  const eventsRange = focusedRange

  // Selected-day stats card: one column per included city, each with that city's
  // sales aggregates (checked datasets only) + weather for the clicked period.
  // Non-included cities never appear. Falls back to weather-only columns when no
  // city has sales, so clicking a date still shows the weather.
  const dayCityColumns = useMemo<CityDayStats[]>(() => {
    const included =
      discovery.status === 'ready' ? discovery.model.cities.filter((c) => includedCities.has(c)) : []
    const salesCities = included.filter((city) => checkedDatasets.some((d) => d.city === city))
    const target = salesCities.length ? salesCities : included
    const cols: CityDayStats[] = []
    for (const city of target) {
      const dsForCity = checkedDatasets.filter((d) => d.city === city)
      const stats = dsForCity.length ? salesStatsInRange(dsForCity, focusedRange) : null
      const st = sheetStates[`${city}-weather`]
      const rows = st?.status === 'ready' ? st.data.rows : null
      const summary = rows ? summarizeWeather(rows, focusedRange) : []
      const glyphs = rows
        ? weatherGlyphInputs(rows, focusedRange)
        : { niceDay: null, rain: null, snow: null }
      // Money: the period's mean daily takings vs the city's all-time average day.
      const period = dsForCity.length ? meanDailyTotal(dsForCity, focusedRange) : null
      const baseline = dsForCity.length ? meanDailyTotal(dsForCity) : null
      const money = period !== null && baseline !== null ? { period, baseline } : null
      if (stats || summary.length) {
        cols.push({
          city: capitalize(city),
          stats,
          weatherText: summary.map((it) => `${it.label}: ${it.value}`).join(' · '),
          niceDay: glyphs.niceDay,
          rain: glyphs.rain,
          snow: glyphs.snow,
          money,
        })
      }
    }
    return cols
  }, [focusedRange, discovery, includedCities, checkedDatasets, sheetStates])

  // Date span that prev/next may step within. Follows the data the user is
  // actually scrubbing, in priority order:
  //   1. plotted sales datasets — so stepping stops at the shop's last sale, not
  //      at the weather sheet's 7-day *forecast* tail (which runs past today);
  //   2. else the selected line series' sheets (weather/markets-only viewing);
  //   3. else every loaded sheet (last-resort, e.g. events-only browsing).
  const dataExtent = useMemo<{ minT: number; maxT: number } | null>(() => {
    let minT = Infinity
    let maxT = -Infinity
    const consider = (a: number, b: number) => {
      minT = Math.min(minT, a, b)
      maxT = Math.max(maxT, a, b)
    }
    const plottedSales = checkedDatasets.filter(datasetVisible)
    if (plottedSales.length) {
      for (const ds of plottedSales) {
        if (ds.tx.length) consider(ds.tx[0][0], ds.tx[ds.tx.length - 1][0])
      }
    } else if (series.length) {
      for (const s of series) {
        const st = sheetStates[s.sheet]
        if (st?.status !== 'ready' || st.data.rows.length === 0) continue
        consider(st.data.rows[0].date.getTime(), st.data.rows[st.data.rows.length - 1].date.getTime())
      }
    } else {
      for (const key of Object.keys(sheetStates)) {
        const st = sheetStates[key]
        if (st?.status !== 'ready' || st.data.rows.length === 0) continue
        consider(st.data.rows[0].date.getTime(), st.data.rows[st.data.rows.length - 1].date.getTime())
      }
    }
    return maxT >= minT ? { minT, maxT } : null
  }, [checkedDatasets, datasetVisible, series, sheetStates])

  // Zoom/pan bounds follow the data being browsed — sales first, else the shown
  // series, else any loaded sheet (dataExtent's priority) — so zooming out or
  // panning can't run past the sales data. Falls back to the day-sheet bounds
  // while nothing is loaded yet.
  const zoomBounds = useMemo(
    () => (dataExtent ? { min: new Date(dataExtent.minT), max: new Date(dataExtent.maxT) } : bounds),
    [dataExtent, bounds],
  )

  // Zoom in/out buttons about the centre. Zoom-in shrinks until one unit fills
  // the screen, then drills to the next finer unit (zoomInSnap); zoom-out grows
  // within the data bounds. Both are just range/unit changes on the history.
  const zoomIn = useCallback(
    () => commitTime((cur) => zoomInSnap(cur, 0.5, 0.5, zoomBounds)),
    [commitTime, zoomBounds],
  )
  const zoomOut = useCallback(
    () => commitTime((cur) => zoomOutSnap(cur, 2, 0.5, zoomBounds)),
    [commitTime, zoomBounds],
  )
  // Zoom-in bottoms out only at a single day at day units; zoom-out at the data extent.
  const canZoomIn = !(granularity === 'day' && spansOneBucket(activeRange, 'day'))
  const canZoomOut =
    activeRange.start.getTime() > startOfDay(zoomBounds.min.getTime()).getTime() ||
    activeRange.end.getTime() < startOfDay(zoomBounds.max.getTime()).getTime()

  // Wheel / pinch zoom, anchored under the pointer. Rapid events within
  // GESTURE_COALESCE_MS collapse into one history entry (replace the top) so a
  // scroll/pinch burst is a single Back step.
  const lastZoomTs = useRef(0)
  const zoomGesture = useCallback(
    (factor: number, anchorFraction: number) => {
      const now = Date.now()
      const replace = now - lastZoomTs.current < GESTURE_COALESCE_MS
      lastZoomTs.current = now
      commitTime(
        (cur) =>
          factor < 1
            ? zoomInSnap(cur, factor, anchorFraction, zoomBounds)
            : zoomOutSnap(cur, factor, anchorFraction, zoomBounds),
        null,
        { replace },
      )
    },
    [commitTime, zoomBounds],
  )

  // Middle-button drag → horizontal pan. `fraction` is cumulative drag distance
  // (as a share of chart width) since the gesture began; applied to the base range
  // captured on the first move, so the whole drag is one history entry.
  const panBaseRef = useRef<DateRange | null>(null)
  const panGesture = useCallback(
    (fraction: number, phase: 'move' | 'end') => {
      if (phase === 'end') {
        panBaseRef.current = null
        return
      }
      const first = panBaseRef.current === null
      const base = panBaseRef.current ?? activeRange
      if (first) panBaseRef.current = base
      commitTime((cur) => ({ range: panRange(base, fraction, zoomBounds), gran: cur.gran }), null, {
        replace: !first,
      })
    },
    [commitTime, zoomBounds, activeRange],
  )

  // Can the whole window slide one unit further and still overlap data? The
  // prev/next buttons stay visible always (see DayStatsCard) but disable at the
  // data's edges. Based on the window edges, not the focus, so they work whether
  // or not a single bucket is clicked.
  const stepBounds = useMemo(() => {
    if (!dataExtent || granularity === 'all') return null
    return {
      first: bucketStart(new Date(dataExtent.minT), granularity).getTime(),
      last: bucketStart(new Date(dataExtent.maxT), granularity).getTime(),
    }
  }, [dataExtent, granularity])
  const canPrev = !!stepBounds && bucketStart(activeRange.start, granularity).getTime() > stepBounds.first
  const canNext = !!stepBounds && bucketStart(activeRange.end, granularity).getTime() < stepBounds.last

  // Step the period one unit (prev/next): slide the whole window by one unit
  // (drop a unit off the start, add one to the end). If a single bucket is
  // focused, move the focus to the newly revealed edge in the same commit;
  // otherwise the whole-range view just pages by one unit.
  const shiftSelection = useCallback(
    (dir: 1 | -1) => {
      if (granularity === 'all') return
      const nextFocus = focusedT !== null ? stepBucket(focusedT, granularity, dir) : null
      commitTime((cur) => ({ range: shiftRangeByUnit(cur.range, cur.gran, dir), gran: cur.gran }), nextFocus)
    },
    [focusedT, granularity, commitTime],
  )

  // All selected curated events (full history), then range-filtered two ways:
  // markerEvents follows the chart's active range; curatedInRange follows the
  // panel range (which narrows to a clicked point).
  const selectedEvents = useMemo(() => {
    const out: CuratedEvent[] = []
    for (const spec of neededEventFiles) {
      const evs = eventData[spec.file]
      if (evs) out.push(...evs)
    }
    return out
  }, [neededEventFiles, eventData])
  const markerEvents = useMemo(
    () => eventsInRange(selectedEvents, activeRange.start, activeRange.end),
    [selectedEvents, activeRange],
  )
  const curatedInRange = useMemo(
    () => eventsInRange(selectedEvents, eventsRange.start, eventsRange.end),
    [selectedEvents, eventsRange],
  )
  // Per-event bucket spans for the hover tooltip.
  const bucketEvents = useMemo<BucketEvent[]>(
    () =>
      markerEvents.map((ev) => ({
        startT: bucketStart(ev.start, granularity).getTime(),
        endT: bucketStart(ev.end, granularity).getTime(),
        name: ev.name,
        tier: eventTier(ev.importance),
      })),
    [markerEvents, granularity],
  )

  // Events can drive the chart alone: with no metric/sales series but events in
  // range, render a skeleton time axis so their markers have something to sit on.
  const eventsActive = eventSources.size > 0 && markerEvents.length > 0

  const chartGroups = useMemo<ChartGroup[]>(() => {
    if (series.length === 0 && salesSeriesIds.length === 0) {
      if (eventsActive)
        return [
          {
            key: 'events',
            title: null,
            series: [],
            barSeries: [],
            data: bucketSkeleton(activeRange, granularity),
            correlations: [],
          },
        ]
      return []
    }
    if (overlap) return [makeGroup('all', null, series, salesDatasets.filter(datasetVisible))]

    const groups: ChartGroup[] = []
    if (discovery.status === 'ready') {
      for (const city of discovery.model.cities) {
        if (!includedCities.has(city)) continue
        const citySeries = series.filter((s) => parseTabName(s.sheet).city === city)
        const citySales = salesDatasets.filter((d) => d.city === city)
        const cityHasSales = citySales.some((d) =>
          SALES_METRICS.some((m) => salesSelections.has(salesSelKey(d.id, m))),
        )
        if (citySeries.length || cityHasSales) groups.push(makeGroup(city, capitalize(city), citySeries, citySales))
      }
    }
    const globalSeries = series.filter((s) => parseTabName(s.sheet).city === null)
    if (globalSeries.length) groups.push(makeGroup('__global__', 'Markets', globalSeries, []))
    return groups
  }, [series, salesSeriesIds, salesDatasets, salesSelections, overlap, makeGroup, discovery, includedCities, datasetVisible, eventsActive, activeRange, granularity])

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
      {/* Chart area — full width (spans the page), moved above the controls */}
      <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CollapseChevron collapsed={chartCollapsed} onClick={toggleChart} label="trends chart" />
              Trends
              {chartCollapsed && (
                <span className="text-xs font-medium text-slate-400">
                  {series.length + salesSeriesIds.length} series
                  {markerEvents.length > 0 ? ` · ${markerEvents.length} events` : ''}
                </span>
              )}
            </h2>
            {!chartCollapsed && (
              <p className="text-xs text-slate-400">
                {timeHistory.length > 1
                  ? 'Drag across the chart to zoom further, or step Back through the range history.'
                  : 'Actual values over the selected range. Drag across the chart to zoom in.'}
              </p>
            )}
          </div>
          {!chartCollapsed && timeHistory.length > 1 && (
            <button
              type="button"
              onClick={back}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              ← Back{timeHistory.length > 2 ? ` (${timeHistory.length - 1})` : ''}
            </button>
          )}
        </div>

        {!chartCollapsed && (
        <>
          <div className="flex flex-col gap-3">
            <DateRangePicker
              onChange={setRangeFromPicker}
              bounds={bounds}
              mode={rangeMode}
              onModeChange={setRangeMode}
            />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <GranularityToggle
                value={granularity}
                onChange={changeGranularity}
                maxLevel={maxLevel}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Zoom</span>
                <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={zoomIn}
                    disabled={!canZoomIn}
                    title="Zoom in — shrink to one unit, then switch to a finer unit"
                    className="rounded-md px-3 py-1 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300 dark:text-slate-300 dark:hover:text-white dark:disabled:text-slate-600"
                  >
                    ＋
                  </button>
                  <button
                    type="button"
                    onClick={zoomOut}
                    disabled={!canZoomOut}
                    title="Zoom out — double the range (within the data's span)"
                    className="rounded-md px-3 py-1 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300 dark:text-slate-300 dark:hover:text-white dark:disabled:text-slate-600"
                  >
                    －
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Scale</span>
                <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
                  {([
                    ['actual', 'Actual'],
                    ['percent', '% change'],
                  ] as const).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setScaleMode(v)}
                      aria-pressed={scaleMode === v}
                      className={
                        'rounded-md px-3 py-1 text-sm font-medium transition-colors ' +
                        (scaleMode === v
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100')
                      }
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

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

          {totalMatchingDays !== null && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {totalMatchingDays.toLocaleString()}
              </span>{' '}
              day{totalMatchingDays === 1 ? '' : 's'} match the current range &amp; filters
              {granularity !== 'all' && ' (hover a point for its day count)'}
            </p>
          )}

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

          {series.length === 0 && salesSeriesIds.length === 0 && !eventsActive ? (
            <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 text-center text-sm text-slate-400 dark:border-slate-700">
              Pick metrics from the categories — or upload a sales file — to plot them.
            </div>
          ) : !hasData ? (
            <div className="flex h-96 items-center justify-center text-sm text-slate-400">
              Loading series…
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {chartGroups.map((g) => {
                const markers = buildMarkers(g.data, markerEvents, granularity)
                return (
                <div key={g.key}>
                  {g.title && (
                    <h3 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                      {g.title}
                    </h3>
                  )}
                  <MultiTrendChart
                    data={g.data}
                    series={g.series}
                    barSeries={g.barSeries}
                    colorById={resolvedColors}
                    percent={scaleMode === 'percent'}
                    onPointClick={setFocusedT}
                    eventMarkers={markers}
                    bucketEvents={bucketEvents}
                    onZoom={zoomTo}
                    onGestureZoom={zoomGesture}
                    onGesturePan={panGesture}
                    hoveredMarkerKey={hoveredMarker}
                    selectedT={focusedT}
                  />
                  <MarkerLegend markers={markers} onHover={setHoveredMarker} hoveredKey={hoveredMarker} />
                  {g.correlations.length > 0 && (
                    <div className="mt-2 flex flex-col gap-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {/* Top 3 strongest relations (by |r|), shown most-positive first. */}
                      {[...g.correlations]
                        .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
                        .slice(0, 3)
                        .sort((a, b) => b.r - a.r)
                        .map((c, i) => (
                        <div key={i}>
                          <span className="text-slate-600 dark:text-slate-300">
                            {c.a} ↔ {c.b}
                          </span>
                          : r ={' '}
                          <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                            {c.r.toFixed(2)}
                          </span>{' '}
                          · {corrLabel(c.r)} <span className="opacity-60">(n={c.n})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </>
        )}
      </section>

      {/* Controls + panels, centered beneath the full-width chart */}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      {/* Cities → categories bar → day filters */}
      <CityControls
        cities={discovery.model.cities}
        included={includedCities}
        overlap={overlap}
        onToggleCity={toggleCity}
        onToggleOverlap={() => setOverlap((o) => !o)}
      />

      <CategoryBar
        categories={categories}
        isSelected={isColSelected}
        selectedCount={selectedCount}
        onToggleColumn={toggleColumn}
        onOpenCategory={onOpenCategory}
        eventSources={eventSources}
        onToggleEventSource={toggleEventSource}
      />

      {dayAttributes && (
        <DayFilters
          dimensions={dayAttributes.dimensions}
          state={filterState}
          onToggle={toggleFilterValue}
        />
      )}

      <SalesPanel
        datasets={salesDatasets}
        selections={salesSelections}
        includedCities={includedCities}
        onUpload={handleUploadSales}
        onToggle={toggleSalesMetric}
        onRemove={removeSalesDataset}
      />

      <SalesSummaryPanel datasets={checkedDatasets.filter((d) => d.summary)} onJumpToDay={jumpToDay} />

      {/* Selected-period stats — per-city weather + sales for the clicked point,
          or the whole active range when nothing is clicked (never empty). */}
      {dayCityColumns.length > 0 && (
        <DayStatsCard
          title={periodLabel(focusedRange)}
          columns={dayCityColumns}
          onClear={focused ? () => setFocusedT(null) : undefined}
          onPrev={() => shiftSelection(-1)}
          onNext={() => shiftSelection(1)}
          canPrev={canPrev}
          canNext={canNext}
        />
      )}

      {/* Curated (local/regional) events — our data, above the Wikipedia panel */}
      <CuratedEventsPanel
        events={curatedInRange}
        range={eventsRange}
        focused={focused}
        onClear={() => setFocusedT(null)}
        active={eventSources.size > 0}
      />

      {/* Global events for the selected range, or a clicked point (bottom) */}
      <EventsPanel
        range={eventsRange}
        focused={focused}
        onClear={() => setFocusedT(null)}
      />
      </div>
    </div>
  )
}
