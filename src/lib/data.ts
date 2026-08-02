// One row of source data: a date plus its numeric columns.
export interface DataRow {
  date: Date
  values: Record<string, number>
}

export type Granularity = 'daily' | 'weekly' | 'monthly'
export type Agg = 'avg' | 'sum'

export interface Metric {
  key: string // column name in the sheet/CSV
  label: string
  unit: string
  agg: Agg // how to roll daily values up to week/month
  decimals: number
  transform?: (v: number) => number // per-row unit conversion
}

// Curated, most-useful metrics from the weather sheet.
export const METRICS: Metric[] = [
  { key: 'temp_mean', label: 'Mean temperature', unit: '°C', agg: 'avg', decimals: 1 },
  { key: 'temp_max', label: 'Max temperature', unit: '°C', agg: 'avg', decimals: 1 },
  { key: 'temp_min', label: 'Min temperature', unit: '°C', agg: 'avg', decimals: 1 },
  { key: 'apparent_temp_mean', label: 'Feels-like (mean)', unit: '°C', agg: 'avg', decimals: 1 },
  { key: 'precipitation', label: 'Precipitation', unit: 'mm', agg: 'sum', decimals: 1 },
  { key: 'rain', label: 'Rain', unit: 'mm', agg: 'sum', decimals: 1 },
  { key: 'snowfall', label: 'Snowfall', unit: 'cm', agg: 'sum', decimals: 1 },
  { key: 'wind_max', label: 'Max wind', unit: 'km/h', agg: 'avg', decimals: 1 },
  {
    key: 'sunshine_duration',
    label: 'Sunshine',
    unit: 'h',
    agg: 'avg',
    decimals: 1,
    transform: (v) => v / 3600, // seconds → hours
  },
  { key: 'solar_radiation', label: 'Solar radiation', unit: '', agg: 'avg', decimals: 2 },
]

export function metricByKey(key: string): Metric {
  return METRICS.find((m) => m.key === key) ?? METRICS[0]
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

// The start of the bucket a date belongs to, at the given granularity.
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
const fullMonth = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

function axisLabel(d: Date, g: Granularity): string {
  return g === 'monthly' ? monthYear.format(d) : dayMonth.format(d)
}

function tooltipLabel(d: Date, g: Granularity): string {
  if (g === 'monthly') return fullMonth.format(d)
  if (g === 'weekly') return `Week of ${fullDay.format(d)}`
  return fullDay.format(d)
}

export interface Point {
  t: number // bucket-start epoch ms (for sorting / x)
  label: string // short axis label
  full: string // full tooltip label
  value: number
}

function round(v: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

// Roll rows up to the chosen granularity for one metric.
export function aggregate(rows: DataRow[], metric: Metric, g: Granularity): Point[] {
  const buckets = new Map<number, { sum: number; count: number; date: Date }>()

  for (const row of rows) {
    const raw = row.values[metric.key]
    if (raw == null || Number.isNaN(raw)) continue
    const v = metric.transform ? metric.transform(raw) : raw

    const start = bucketStart(row.date, g)
    const key = start.getTime()
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.sum += v
      bucket.count += 1
    } else {
      buckets.set(key, { sum: v, count: 1, date: start })
    }
  }

  return [...buckets.entries()]
    .map(([t, b]) => ({
      t,
      label: axisLabel(b.date, g),
      full: tooltipLabel(b.date, g),
      value: round(metric.agg === 'sum' ? b.sum : b.sum / b.count, metric.decimals),
    }))
    .sort((a, b) => a.t - b.t)
}

export interface SeriesStats {
  min: number
  max: number
  avg: number
  latest: number
}

export function computeStats(points: Point[], decimals: number): SeriesStats | null {
  if (points.length === 0) return null
  let min = Infinity
  let max = -Infinity
  let sum = 0
  for (const p of points) {
    if (p.value < min) min = p.value
    if (p.value > max) max = p.value
    sum += p.value
  }
  return {
    min: round(min, decimals),
    max: round(max, decimals),
    avg: round(sum / points.length, decimals),
    latest: points[points.length - 1].value,
  }
}
