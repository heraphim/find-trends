import { unzipSync, strFromU8 } from 'fflate'
import { SHEET_ID } from './sheet'

const XLSX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

// Fetch the workbook and read the ordered list of tab names from workbook.xml.
// (We only parse the tiny workbook.xml — cell data is loaded per-sheet as CSV.)
export async function discoverTabNames(): Promise<string[]> {
  const res = await fetch(XLSX_URL)
  if (!res.ok) throw new Error(`Could not read the workbook (HTTP ${res.status}).`)
  const buf = new Uint8Array(await res.arrayBuffer())
  const files = unzipSync(buf, { filter: (f) => f.name === 'xl/workbook.xml' })
  const xml = strFromU8(files['xl/workbook.xml'] ?? new Uint8Array())

  const names: string[] = []
  for (const m of xml.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)) {
    names.push(decodeXmlEntities(m[1]))
  }
  return names
}

export interface ParsedTab {
  sheet: string // exact sheet/tab name
  city: string | null // xxx (null = global, shown on every tab)
  category: string // yyy, or the whole name when there is no hyphen
}

// Split "xxx-yyy" → {city: xxx, category: yyy}; a name with no hyphen is global.
export function parseTabName(name: string): ParsedTab {
  const i = name.indexOf('-')
  if (i === -1) return { sheet: name, city: null, category: name }
  return { sheet: name, city: name.slice(0, i), category: name.slice(i + 1) }
}

export interface WorkbookModel {
  cities: string[] // ordered top-level tabs
  byCity: Map<string, ParsedTab[]> // city → its own categories
  global: ParsedTab[] // categories shown on every tab
  daysSheet: string | null // the per-day reference/filter sheet, if present
}

export function buildModel(names: string[]): WorkbookModel {
  const cities: string[] = []
  const byCity = new Map<string, ParsedTab[]>()
  const global: ParsedTab[] = []
  let daysSheet: string | null = null

  for (const name of names) {
    // The "days" (or "date") reference sheet is not a plottable category —
    // it supplies the per-day filter attributes instead.
    const low = name.trim().toLowerCase()
    if (low === 'days' || low === 'date') {
      if (!daysSheet) daysSheet = name
      continue
    }
    const tab = parseTabName(name)
    if (tab.city === null) {
      global.push(tab)
    } else {
      if (!byCity.has(tab.city)) {
        byCity.set(tab.city, [])
        cities.push(tab.city)
      }
      byCity.get(tab.city)!.push(tab)
    }
  }

  return { cities, byCity, global, daysSheet }
}

// Categories to show for a given city: its own, then the global ones.
export function categoriesForCity(model: WorkbookModel, city: string): ParsedTab[] {
  return [...(model.byCity.get(city) ?? []), ...model.global]
}
