import type { DateRange } from './dateRange'

// One row of source data: a date plus its numeric columns.
export interface DataRow {
  date: Date
  values: Record<string, number>
}

export type Granularity = 'day' | 'week' | 'month' | 'year' | 'all'
export type ColumnKind = 'metric' | 'event'

// A column and whether it's a plottable number or a categorical "event".
export interface ColumnInfo {
  key: string
  kind: ColumnKind
}

export interface SheetData {
  rows: DataRow[]
  columns: ColumnInfo[]
}

// Parse the sheet's "DD-MM-YY" date. Returns null for anything unparseable.
export function parseSheetDate(input: string | undefined): Date | null {
  if (!input) return null
  const parts = input.trim().split(/[-/]/).map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  let [day, month, year] = parts
  if (year < 100) year += 2000 // two-digit year → 2000s
  const d = new Date(year, month - 1, day)
  return Number.isNaN(d.getTime()) ? null : d
}

// A value counts as numeric if it parses to a finite number.
function isNumeric(v: string): boolean {
  if (v.trim() === '') return false
  return Number.isFinite(Number(v))
}

// Numeric columns that are really categorical codes, not magnitudes — force
// them to "event" so they classify days instead of plotting as a line.
const FORCE_EVENT = new Set(['weather_code'])

// Classify every non-date column by sampling its values:
// all-numeric → metric (plottable), otherwise → event (day classifier).
export function classifyColumns(
  records: Record<string, string>[],
  dateColumn: string,
): ColumnInfo[] {
  if (records.length === 0) return []
  const keys = Object.keys(records[0]).filter((k) => k !== dateColumn && k !== '')
  const sample = records.slice(0, 60)

  return keys.map((key) => {
    if (FORCE_EVENT.has(key)) return { key, kind: 'event' as const }
    let seenValue = false
    let allNumeric = true
    for (const rec of sample) {
      const v = rec[key]
      if (v == null || v.trim() === '') continue
      seenValue = true
      if (!isNumeric(v)) {
        allNumeric = false
        break
      }
    }
    return { key, kind: seenValue && allNumeric ? 'metric' : 'event' }
  })
}

// ---- bucketing & labels ----

// A fixed epoch so granularity 'all' collapses every row into one bucket.
const ALL_BUCKET = new Date(2000, 0, 1)

export function bucketStart(d: Date, g: Granularity): Date {
  if (g === 'all') return ALL_BUCKET
  if (g === 'year') return new Date(d.getFullYear(), 0, 1)
  if (g === 'month') return new Date(d.getFullYear(), d.getMonth(), 1)
  if (g === 'week') {
    const mondayOffset = (d.getDay() + 6) % 7 // 0 = Monday
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayOffset)
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

const monthYear = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' })
const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const fullDay = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function axisLabel(d: Date, g: Granularity): string {
  if (g === 'all') return 'All'
  if (g === 'year') return String(d.getFullYear())
  if (g === 'month') return monthYear.format(d)
  return dayMonth.format(d)
}

function tooltipLabel(d: Date, g: Granularity): string {
  if (g === 'all') return 'All data'
  if (g === 'year') return String(d.getFullYear())
  if (g === 'month') return monthYear.format(d)
  if (g === 'week') return `Week of ${fullDay.format(d)}`
  return fullDay.format(d)
}

// The {t,label,full} header for a bucket, given its start date. Public so other
// datasets (e.g. uploaded sales) can build ChartRows on the same time axis.
export function bucketRow(date: Date, g: Granularity): { t: number; label: string; full: string } {
  return { t: date.getTime(), label: axisLabel(date, g), full: tooltipLabel(date, g) }
}

// Union two ChartRow arrays by bucket time, merging their series keys onto one
// row per bucket. Existing label/full/_days on `a` win; `b` only contributes its
// own series values (it never carries `a`'s keys), so line + bar datasets that
// share a time axis combine cleanly.
export function mergeRowsByT(a: ChartRow[], b: ChartRow[]): ChartRow[] {
  const map = new Map<number, ChartRow>()
  for (const r of a) map.set(r.t, { ...r })
  for (const r of b) {
    const ex = map.get(r.t)
    if (ex) Object.assign(ex, r, { t: ex.t, label: ex.label, full: ex.full })
    else map.set(r.t, { ...r })
  }
  return [...map.values()].sort((x, y) => x.t - y.t)
}

// ---- indexed multi-series aggregation ----

export interface SeriesSpec {
  id: string // `${sheet}::${column}`
  sheet: string
  column: string
  label: string // human label, e.g. "Brasov · temp_mean"
  unit: string // display unit for this series ('' = none)
}

// A row of the merged chart dataset: bucket time + one % value per series id.
export interface ChartRow {
  t: number
  label: string
  full: string
  [seriesId: string]: number | string
}

// Average a single column into buckets. Returns sorted [t, {value, date}].
function bucketAverages(
  rows: DataRow[],
  column: string,
  g: Granularity,
): { t: number; value: number; date: Date }[] {
  const buckets = new Map<number, { sum: number; count: number; date: Date }>()
  for (const row of rows) {
    const v = row.values[column]
    if (v == null || Number.isNaN(v)) continue
    const start = bucketStart(row.date, g)
    const key = start.getTime()
    const b = buckets.get(key)
    if (b) {
      b.sum += v
      b.count += 1
    } else {
      buckets.set(key, { sum: v, count: 1, date: start })
    }
  }
  return [...buckets.entries()]
    .map(([t, b]) => ({ t, value: b.sum / b.count, date: b.date }))
    .sort((a, b) => a.t - b.t)
}

function round(v: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

// Aggregate a column into buckets with the given roll-up (avg or sum) and an
// optional per-row transform (e.g. seconds → hours).
function bucketAggregate(
  rows: DataRow[],
  column: string,
  g: Granularity,
  agg: 'avg' | 'sum',
  transform?: (v: number) => number,
): { t: number; value: number; date: Date }[] {
  const buckets = new Map<number, { sum: number; count: number; date: Date }>()
  for (const row of rows) {
    let v = row.values[column]
    if (v == null || Number.isNaN(v)) continue
    if (transform) v = transform(v)
    const start = bucketStart(row.date, g)
    const key = start.getTime()
    const b = buckets.get(key)
    if (b) {
      b.sum += v
      b.count += 1
    } else {
      buckets.set(key, { sum: v, count: 1, date: start })
    }
  }
  return [...buckets.entries()]
    .map(([t, b]) => ({ t, value: agg === 'sum' ? b.sum : b.sum / b.count, date: b.date }))
    .sort((a, b) => a.t - b.t)
}

// Rebase each series to % change from its first in-view value, so series of
// very different magnitudes become comparable on one axis.
export function rebaseToPercent(rows: ChartRow[], seriesIds: string[]): ChartRow[] {
  const base: Record<string, number> = {}
  for (const id of seriesIds) {
    for (const r of rows) {
      const v = r[id]
      if (typeof v === 'number') {
        base[id] = v
        break
      }
    }
  }
  return rows.map((r) => {
    const out: ChartRow = { t: r.t, label: r.label, full: r.full }
    if (typeof r._days === 'number') out._days = r._days
    for (const id of seriesIds) {
      const v = r[id]
      const b = base[id]
      if (typeof v === 'number' && b !== undefined && b !== 0) {
        out[id] = Math.round((v / b - 1) * 1000) / 10
      }
    }
    return out
  })
}

// Pearson correlation of two equal-length numeric arrays.
export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
    sxx += xs[i] * xs[i]
    syy += ys[i] * ys[i]
    sxy += xs[i] * ys[i]
  }
  const dx = Math.sqrt(n * sxx - sx * sx)
  const dy = Math.sqrt(n * syy - sy * sy)
  if (dx === 0 || dy === 0) return null
  return (n * sxy - sx * sy) / (dx * dy)
}

export interface PairCorrelation {
  a: string
  b: string
  r: number
  n: number
}

// Pairwise correlations between series, on points where both have a value.
export function seriesCorrelations(
  rows: ChartRow[],
  series: { id: string; label: string }[],
): PairCorrelation[] {
  const out: PairCorrelation[] = []
  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const xs: number[] = []
      const ys: number[] = []
      for (const r of rows) {
        const va = r[series[i].id]
        const vb = r[series[j].id]
        if (typeof va === 'number' && typeof vb === 'number') {
          xs.push(va)
          ys.push(vb)
        }
      }
      const r = pearson(xs, ys)
      if (r !== null) out.push({ a: series[i].label, b: series[j].label, r, n: xs.length })
    }
  }
  return out.sort((x, y) => Math.abs(y.r) - Math.abs(x.r))
}

// The date range a clicked chart point (bucket) covers, given the granularity.
// Returns null for 'all' (the single point spans the whole range).
export function bucketToRange(t: number, g: Granularity): DateRange | null {
  if (g === 'all') return null
  const d = new Date(t)
  const y = d.getFullYear()
  const m = d.getMonth()
  const day = d.getDate()
  if (g === 'year') return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) }
  if (g === 'month') return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) }
  if (g === 'week') return { start: new Date(y, m, day), end: new Date(y, m, day + 6) }
  return { start: new Date(y, m, day), end: new Date(y, m, day) } // day
}

// Count how many of the given dates fall into each bucket (same bucketing as
// the charts), so a point's aggregate can report the days behind it.
export function bucketDates(dates: Date[], g: Granularity): Map<number, number> {
  const m = new Map<number, number>()
  for (const d of dates) {
    const k = bucketStart(d, g).getTime()
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

// Merge every selected series into ONE dataset of actual values on a shared
// time axis (units may differ — the chart shows each series' unit per point).
export function aggregateMerged(
  inputs: { spec: SeriesSpec; rows: DataRow[]; meta: ChartMeta }[],
  g: Granularity,
): ChartRow[] {
  const merged = new Map<number, ChartRow>()
  for (const { spec, rows, meta } of inputs) {
    for (const p of bucketAggregate(rows, spec.column, g, meta.agg, meta.transform)) {
      let chartRow = merged.get(p.t)
      if (!chartRow) {
        chartRow = { t: p.t, label: axisLabel(p.date, g), full: tooltipLabel(p.date, g) }
        merged.set(p.t, chartRow)
      }
      chartRow[spec.id] = round(p.value, 2)
    }
  }
  return [...merged.values()].sort((a, b) => a.t - b.t)
}

export interface GroupChart {
  key: string // group id
  title: string
  unit: string
  series: SeriesSpec[]
  data: ChartRow[]
}

// Group selected series by unit/instrument into separate charts, each showing
// ACTUAL values (not indexed). Series sharing a group overlay on one axis.
export function buildGroupCharts(
  inputs: { spec: SeriesSpec; rows: DataRow[]; meta: ChartMeta }[],
  g: Granularity,
): GroupChart[] {
  const groups = new Map<
    string,
    { title: string; unit: string; series: SeriesSpec[]; merged: Map<number, ChartRow>; order: number }
  >()
  let order = 0

  for (const { spec, rows, meta } of inputs) {
    let grp = groups.get(meta.group)
    if (!grp) {
      grp = { title: meta.groupTitle, unit: meta.unit, series: [], merged: new Map(), order: order++ }
      groups.set(meta.group, grp)
    }
    grp.series.push(spec)
    for (const p of bucketAggregate(rows, spec.column, g, meta.agg, meta.transform)) {
      let chartRow = grp.merged.get(p.t)
      if (!chartRow) {
        chartRow = { t: p.t, label: axisLabel(p.date, g), full: tooltipLabel(p.date, g) }
        grp.merged.set(p.t, chartRow)
      }
      chartRow[spec.id] = round(p.value, 2)
    }
  }

  return [...groups.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, grp]) => ({
      key,
      title: grp.title,
      unit: grp.unit,
      series: grp.series,
      data: [...grp.merged.values()].sort((a, b) => a.t - b.t),
    }))
}

// Minimal shape buildGroupCharts needs from metricMeta (avoids a lib cycle).
export interface ChartMeta {
  unit: string
  group: string
  groupTitle: string
  agg: 'avg' | 'sum'
  transform?: (v: number) => number
}

// Build the merged dataset: every series indexed to % change from its first
// bucket, aligned on a shared time axis so they overlay on one % scale.
export function aggregateIndexed(
  inputs: { spec: SeriesSpec; rows: DataRow[] }[],
  g: Granularity,
): ChartRow[] {
  const merged = new Map<number, ChartRow>()

  for (const { spec, rows } of inputs) {
    const points = bucketAverages(rows, spec.column, g)
    if (points.length === 0) continue
    const base = points[0].value

    for (const p of points) {
      const pct = base !== 0 ? (p.value / base - 1) * 100 : p.value - base
      let chartRow = merged.get(p.t)
      if (!chartRow) {
        chartRow = { t: p.t, label: axisLabel(p.date, g), full: tooltipLabel(p.date, g) }
        merged.set(p.t, chartRow)
      }
      chartRow[spec.id] = Math.round(pct * 10) / 10
    }
  }

  return [...merged.values()].sort((a, b) => a.t - b.t)
}
