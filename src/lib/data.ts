// One row of source data: a date plus its numeric columns.
export interface DataRow {
  date: Date
  values: Record<string, number>
}

export type Granularity = 'daily' | 'weekly' | 'monthly'
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

function bucketStart(d: Date, g: Granularity): Date {
  if (g === 'monthly') return new Date(d.getFullYear(), d.getMonth(), 1)
  if (g === 'weekly') {
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
  return g === 'monthly' ? monthYear.format(d) : dayMonth.format(d)
}

function tooltipLabel(d: Date, g: Granularity): string {
  if (g === 'monthly') return monthYear.format(d)
  if (g === 'weekly') return `Week of ${fullDay.format(d)}`
  return fullDay.format(d)
}

// ---- indexed multi-series aggregation ----

export interface SeriesSpec {
  id: string // `${sheet}::${column}`
  sheet: string
  column: string
  label: string // human label, e.g. "Brasov · temp_mean"
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
