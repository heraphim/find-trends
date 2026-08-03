// Ordered list of tab names, from the static manifest in public/data/.
// (Cell data is loaded per-tab as CSV; see sheet.ts.)
const MANIFEST_URL = `${import.meta.env.BASE_URL}data/tabs.json`

export async function discoverTabNames(): Promise<string[]> {
  const res = await fetch(MANIFEST_URL)
  if (!res.ok) throw new Error(`Could not read the data manifest (HTTP ${res.status}).`)
  const names = (await res.json()) as unknown
  if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) {
    throw new Error('Data manifest is malformed (expected a list of tab names).')
  }
  return names as string[]
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
