import Papa from 'papaparse'
import { csvUrlForSheet } from './sheet'
import { parseSheetDate } from './data'
import { withVersion } from './version'

export interface FilterDimension {
  column: string // e.g. 'season', 'is_weekend', 'is_weekday'
  values: string[] // ordered distinct values, each a checkbox
}

export interface DayAttributes {
  dimensions: FilterDimension[]
  byDate: Map<number, Record<string, string>> // epoch(ms) → { column: value }
}

const MAX_DISTINCT = 20 // guard against high-cardinality columns

// Day columns that exist but should NOT become filters (e.g. the weekday-name
// column is redundant with the weekend flag).
const EXCLUDED_FILTERS = new Set(['is_weekday', 'weekday'])

function isNumeric(v: string): boolean {
  if (v.trim() === '') return false
  return Number.isFinite(Number(v))
}

const ORDERS: Record<string, string[]> = {
  weekday: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  season: ['Spring', 'Summer', 'Autumn', 'Winter'],
  bool: ['TRUE', 'FALSE'],
}

function orderValues(values: string[]): string[] {
  for (const order of Object.values(ORDERS)) {
    if (values.every((v) => order.includes(v))) {
      return [...values].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    }
  }
  return [...values].sort()
}

// Load the days sheet: identify non-numeric, low-cardinality columns as filter
// dimensions, and map every date to its attribute values.
export async function fetchDayAttributes(sheetName: string): Promise<DayAttributes> {
  const res = await fetch(withVersion(csvUrlForSheet(sheetName)))
  if (!res.ok) throw new Error(`Could not read "${sheetName}" (HTTP ${res.status}).`)
  const text = await res.text()
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
  const records = parsed.data
  if (records.length === 0) return { dimensions: [], byDate: new Map() }

  const keys = Object.keys(records[0]).filter((k) => k !== 'date' && k !== '')

  // A column is filterable if it's categorical (some non-numeric values) and
  // low-cardinality.
  const distinct: Record<string, Set<string>> = {}
  for (const k of keys) distinct[k] = new Set()
  for (const rec of records) {
    for (const k of keys) {
      const v = rec[k]
      if (v != null && v.trim() !== '') distinct[k].add(v)
    }
  }
  const filterCols = keys.filter((k) => {
    if (EXCLUDED_FILTERS.has(k.toLowerCase())) return false
    const vals = [...distinct[k]]
    return vals.length > 0 && vals.length <= MAX_DISTINCT && vals.some((v) => !isNumeric(v))
  })

  const byDate = new Map<number, Record<string, string>>()
  for (const rec of records) {
    const d = parseSheetDate(rec['date'])
    if (!d) continue
    const attrs: Record<string, string> = {}
    for (const k of filterCols) {
      const v = rec[k]
      if (v != null && v.trim() !== '') attrs[k] = v
    }
    byDate.set(d.getTime(), attrs)
  }

  const dimensions = filterCols.map((k) => ({ column: k, values: orderValues([...distinct[k]]) }))
  return { dimensions, byDate }
}
