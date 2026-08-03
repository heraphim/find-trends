import { bucketRow, bucketStart, type ChartRow, type Granularity, type SeriesSpec } from './data'
import type { DateRange } from './dateRange'
import { capitalize } from './labels'

// A single purchase from an uploaded sales workbook.
export type Purchase = [number, number] // [epochMs at local midnight, amount]

export interface SalesDataset {
  id: string
  name: string // display name (filename without extension)
  city: string | null // parsed from a "City - …" filename prefix (diacritic-stripped, lowercased)
  uploadedAt: number
  tx: Purchase[] // sorted ascending by date
}

// The three per-dataset series a user can plot (checkboxes in the Sales panel).
export type SalesMetric = 'amount' | 'chg_prev' | 'chg_avg5'
export const SALES_METRICS: SalesMetric[] = ['amount', 'chg_prev', 'chg_avg5']

// Short labels for the panel checkboxes.
export const SALES_METRIC_LABEL: Record<SalesMetric, string> = {
  amount: 'Amount',
  chg_prev: 'Δ vs previous',
  chg_avg5: 'Δ vs avg of prev 5',
}

// A selection key ties a dataset to one of its metrics.
export function salesSelKey(dsId: string, metric: SalesMetric): string {
  return `${dsId}::${metric}`
}
export function salesSeriesId(dsId: string, metric: SalesMetric): string {
  return `sales::${dsId}::${metric}`
}

// ---- workbook layout (fixed by the shop's export format) ----
const TITLE_ROW = 2 // row 3 (0-based) holds column titles
const DATA_START = 3 // data begins at row 4
const DATE_COL = 6 // column G
const AMOUNT_COL = 8 // column I

// "Brașov - Sales 2024.xlsx" → { name: "Brașov - Sales 2024", city: "brasov" }
function parseName(filename: string): { name: string; city: string | null } {
  const name = filename.replace(/\.[^.]+$/, '').trim()
  const m = /^(.+?)\s*[-–—]\s*/.exec(name)
  const city = m ? normalizeCity(m[1]) : null
  return { name, city }
}

// Strip diacritics + lowercase so "Brașov" matches the "brasov" weather tab.
export function normalizeCity(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

// Excel serial date → a local-midnight Date, timezone-safe (build from UTC parts).
function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null
  const ms = Math.round((serial - 25569) * 86400 * 1000) // 25569 = days 1899-12-30 → 1970-01-01
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

// Parse a date cell that may arrive as a Date, an Excel serial, or a string.
// Day-first for D.M.Y / D-M-Y / D/M/Y (the Romanian convention); ISO handled too.
function toDate(v: unknown): Date | null {
  if (v instanceof Date) {
    // SheetJS anchors date cells to UTC; read UTC parts to avoid a tz day-shift.
    return Number.isNaN(v.getTime()) ? null : new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())
  }
  if (typeof v === 'number') return excelSerialToDate(v)
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3])
  const dmy = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/.exec(s)
  if (dmy) {
    let y = +dmy[3]
    if (y < 100) y += 2000
    return new Date(y, +dmy[2] - 1, +dmy[1])
  }
  const t = Date.parse(s)
  if (Number.isNaN(t)) return null
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// Parse an amount cell. Numbers pass through; strings are cleaned of currency
// symbols and thousands separators (handling both "1.234,56" and "1,234.56").
function toAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.trim().replace(/[^0-9.,-]/g, '')
  if (!s) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.') // comma is the decimal sep
  else s = s.replace(/,/g, '') // dot decimal (or integer) — drop thousands commas
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function makeId(): string {
  const c = globalThis.crypto
  return c && 'randomUUID' in c ? c.randomUUID() : `sales-${Date.now()}-${Math.round(Math.random() * 1e9)}`
}

// Parse an uploaded .xls/.xlsx into a SalesDataset. Reads the first sheet, takes
// column G as the date and column I as the amount, from row 4 onward.
export async function parseSalesFile(file: File): Promise<SalesDataset> {
  // Lazy-loaded so the ~700 KB SheetJS bundle only ships when someone uploads.
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  // No cellDates: real Excel dates arrive as serial numbers, which we convert
  // timezone-safely (cellDates would hand back UTC-anchored Dates that shift a
  // day in behind-UTC zones). Text dates arrive as strings and are parsed too.
  const wb = XLSX.read(buf)
  const first = wb.SheetNames[0]
  const sheet = first ? wb.Sheets[first] : undefined
  if (!sheet) throw new Error('That file has no sheets.')
  // blankrows:true keeps empty rows so the fixed layout (titles on row 3, data
  // from row 4) stays aligned to absolute sheet rows instead of being compacted.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  })

  const tx: Purchase[] = []
  for (let i = DATA_START; i < grid.length; i++) {
    const row = grid[i]
    if (!Array.isArray(row)) continue
    const d = toDate(row[DATE_COL])
    const amt = toAmount(row[AMOUNT_COL])
    if (!d || amt == null) continue
    tx.push([d.getTime(), amt])
  }
  if (tx.length === 0) {
    throw new Error(
      'No sales rows found. Expected a date in column G and an amount in column I, starting at row 4.',
    )
  }
  tx.sort((a, b) => a[0] - b[0])
  const { name, city } = parseName(file.name)
  return { id: makeId(), name, city, uploadedAt: Date.now(), tx }
}

void TITLE_ROW // titles row is skipped; kept as documentation of the layout

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

// Sum purchases into buckets, restricted to the range and (optionally) the days
// passing the day filters. Sales always TOTAL per bucket.
export function bucketSalesAmounts(
  tx: Purchase[],
  range: DateRange,
  allowedDates: Set<number> | null,
  g: Granularity,
): { t: number; value: number; date: Date }[] {
  const startT = range.start.getTime()
  const endT = range.end.getTime()
  const buckets = new Map<number, { sum: number; date: Date }>()
  for (const [ts, amt] of tx) {
    if (ts < startT || ts > endT) continue
    if (allowedDates && !allowedDates.has(ts)) continue
    const bs = bucketStart(new Date(ts), g)
    const key = bs.getTime()
    const b = buckets.get(key)
    if (b) b.sum += amt
    else buckets.set(key, { sum: amt, date: bs })
  }
  return [...buckets.entries()]
    .map(([t, b]) => ({ t, value: b.sum, date: b.date }))
    .sort((a, b) => a.t - b.t)
}

// Derive the two change series from an ordered amounts sequence:
//  chg_prev  = % change vs the previous bucket
//  chg_avg5  = % change vs the mean of up to the previous 5 buckets
// Both operate on the already-filtered sequence (per the spec).
function deriveChanges(amounts: { t: number; value: number }[]): {
  prev: Map<number, number>
  avg5: Map<number, number>
} {
  const prev = new Map<number, number>()
  const avg5 = new Map<number, number>()
  for (let i = 1; i < amounts.length; i++) {
    const p = amounts[i - 1].value
    if (p !== 0) prev.set(amounts[i].t, (amounts[i].value / p - 1) * 100)
    const window = amounts.slice(Math.max(0, i - 5), i)
    const mean = window.reduce((s, a) => s + a.value, 0) / window.length
    if (mean !== 0) avg5.set(amounts[i].t, (amounts[i].value / mean - 1) * 100)
  }
  return { prev, avg5 }
}

function salesLabel(ds: SalesDataset, metric: SalesMetric): string {
  const who = capitalize(ds.city ?? ds.name)
  return metric === 'amount' ? `${who} · Sales` : `${who} · Sales ${SALES_METRIC_LABEL[metric]}`
}

// Build chart series + rows for the selected sales metrics of the given datasets.
// Amount series carry no unit; change series are '%'.
export function buildSalesSeries(
  datasets: SalesDataset[],
  selections: Set<string>,
  range: DateRange,
  allowedDates: Set<number> | null,
  g: Granularity,
): { series: SeriesSpec[]; rows: ChartRow[] } {
  const series: SeriesSpec[] = []
  const merged = new Map<number, ChartRow>()

  const put = (id: string, t: number, date: Date, v: number) => {
    let row = merged.get(t)
    if (!row) {
      row = bucketRow(date, g)
      merged.set(t, row)
    }
    row[id] = round2(v)
  }

  for (const ds of datasets) {
    const selected = SALES_METRICS.filter((m) => selections.has(salesSelKey(ds.id, m)))
    if (selected.length === 0) continue
    const amounts = bucketSalesAmounts(ds.tx, range, allowedDates, g)
    const { prev, avg5 } = deriveChanges(amounts)
    for (const metric of selected) {
      const id = salesSeriesId(ds.id, metric)
      series.push({
        id,
        sheet: `sales:${ds.id}`,
        column: metric,
        label: salesLabel(ds, metric),
        unit: metric === 'amount' ? '' : '%',
      })
      if (metric === 'amount') {
        for (const a of amounts) put(id, a.t, a.date, a.value)
      } else {
        const map = metric === 'chg_prev' ? prev : avg5
        for (const a of amounts) {
          const v = map.get(a.t)
          if (v !== undefined) put(id, a.t, a.date, v)
        }
      }
    }
  }
  return { series, rows: [...merged.values()].sort((a, b) => a.t - b.t) }
}

export interface SalesStats {
  count: number
  total: number
  average: number
  low: number[] // up to 3 smallest purchases, ascending
  high: number[] // up to 3 largest purchases, descending
}

// Aggregate every purchase within [range] across the given datasets. Used by the
// selected-day stats card (day filters don't apply — the user picked this period).
export function salesStatsInRange(datasets: SalesDataset[], range: DateRange): SalesStats | null {
  const startT = range.start.getTime()
  const endT = range.end.getTime()
  const amounts: number[] = []
  let total = 0
  for (const ds of datasets) {
    for (const [ts, amt] of ds.tx) {
      if (ts < startT || ts > endT) continue
      amounts.push(amt)
      total += amt
    }
  }
  if (amounts.length === 0) return null
  const sorted = [...amounts].sort((a, b) => a - b)
  return {
    count: amounts.length,
    total,
    average: total / amounts.length,
    low: sorted.slice(0, 3),
    high: sorted.slice(-3).reverse(),
  }
}

// Mean of the per-day totals across the given datasets, optionally within a
// range. Used to compare a selected day's takings against the city's typical day.
export function meanDailyTotal(datasets: SalesDataset[], range?: DateRange): number | null {
  const startT = range?.start.getTime()
  const endT = range?.end.getTime()
  const byDay = new Map<number, number>()
  for (const ds of datasets) {
    for (const [ts, amt] of ds.tx) {
      if (range && (ts < startT! || ts > endT!)) continue
      byDay.set(ts, (byDay.get(ts) ?? 0) + amt)
    }
  }
  if (byDay.size === 0) return null
  let sum = 0
  for (const v of byDay.values()) sum += v
  return sum / byDay.size
}

// Span of a dataset's dates, for the panel's "2020 – 2024" hint.
export function datasetSpan(ds: SalesDataset): { start: Date; end: Date } | null {
  if (ds.tx.length === 0) return null
  return { start: new Date(ds.tx[0][0]), end: new Date(ds.tx[ds.tx.length - 1][0]) }
}
