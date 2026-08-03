import Papa from 'papaparse'
import type { Tier } from './events'
import { withVersion } from './version'

// Curated events live as static CSVs next to the trend data, in the rich schema:
// Start Date,End Date,Event Name,Event Type,Impact Category,Positive or Negative,Importance (1-100),Description
// Dates are ISO YYYY-MM-DD (unlike the DD-MM-YY trend tabs).
export type EventSource = 'local' | 'romania' | 'global'

export interface CuratedEvent {
  start: Date
  end: Date
  name: string
  type: string
  impact: string
  posneg: string
  importance: number
  description: string
  source: EventSource
  city?: string // set for 'local' events (which city file they came from)
}

// Which CSV files back each source. 'local' is city-keyed so it can resolve to
// whichever cities are currently included (no per-city duplication in the UI).
interface FileSpec {
  file: string
  source: EventSource
  city?: string
}

export const EVENT_FILES: FileSpec[] = [
  { file: 'brasov_events.csv', source: 'local', city: 'brasov' },
  { file: 'sibiu_events.csv', source: 'local', city: 'sibiu' },
  { file: 'romania_events.csv', source: 'romania' },
  { file: 'global_events.csv', source: 'global' },
]

export const SOURCE_LABEL: Record<EventSource, string> = {
  local: 'Local',
  romania: 'Romania',
  global: 'Global',
}

// Importance (1-100) → the same three tiers the Wikipedia panel already styles.
export function eventTier(importance: number): Tier {
  if (importance >= 80) return 'major'
  if (importance >= 50) return 'notable'
  return 'minor'
}

function parseISO(s: string | undefined): Date | null {
  if (!s) return null
  const parts = s.trim().split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  const [y, m, d] = parts
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date
}

const eventUrl = (file: string) => `${import.meta.env.BASE_URL}data/events/${file}`

// Fetch + parse one event CSV into typed rows (same fetch/Papa pattern as lib/sheet.ts).
export async function fetchEventFile(spec: FileSpec): Promise<CuratedEvent[]> {
  const res = await fetch(withVersion(eventUrl(spec.file)))
  if (!res.ok) throw new Error(`Could not read events "${spec.file}" (HTTP ${res.status}).`)
  const text = await res.text()
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
  const out: CuratedEvent[] = []
  for (const r of parsed.data) {
    const start = parseISO(r['Start Date'])
    if (!start) continue
    const end = parseISO(r['End Date']) ?? start
    const name = (r['Event Name'] ?? '').trim()
    if (!name) continue
    out.push({
      start,
      end,
      name,
      type: (r['Event Type'] ?? '').trim(),
      impact: (r['Impact Category'] ?? '').trim(),
      posneg: (r['Positive or Negative'] ?? '').trim(),
      importance: Number(r['Importance (1-100)']) || 0,
      description: (r['Description'] ?? '').trim(),
      source: spec.source,
      city: spec.city,
    })
  }
  return out
}

// The file specs needed for the active sources — 'local' resolves to the
// currently included cities so an unchecked city drops its local events.
export function filesForSelection(sources: Set<string>, includedCities: Set<string>): FileSpec[] {
  return EVENT_FILES.filter((f) => {
    if (!sources.has(f.source)) return false
    if (f.source === 'local') return f.city !== undefined && includedCities.has(f.city)
    return true
  })
}

// Events overlapping [start, end], sorted by importance desc.
export function eventsInRange(events: CuratedEvent[], start: Date, end: Date): CuratedEvent[] {
  const s = start.getTime()
  const e = end.getTime()
  return events
    .filter((ev) => ev.end.getTime() >= s && ev.start.getTime() <= e)
    .sort((a, b) => b.importance - a.importance)
}
