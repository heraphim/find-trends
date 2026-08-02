import type { DateRange } from './dateRange'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Strip wiki markup down to readable plain text.
function cleanWikitext(s: string): string {
  let out = s
  out = out.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
  out = out.replace(/<ref[^>]*\/>/g, '')
  // Remove templates (a couple of passes for simple nesting).
  for (let i = 0; i < 3; i++) out = out.replace(/\{\{[^{}]*\}\}/g, '')
  out = out.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1') // [[a|b]] -> b
  out = out.replace(/\[\[([^\]]*)\]\]/g, '$1') // [[a]] -> a
  out = out.replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, '$1') // [url text] -> text
  out = out.replace(/'''?/g, '')
  out = out.replace(/<[^>]+>/g, '')
  out = out.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  return out.replace(/\s+/g, ' ').trim()
}

async function fetchParse(params: Record<string, string>): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ ...params, format: 'json', formatversion: '2', origin: '*' })
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${q}`)
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`)
  return res.json()
}

// ---- daily "current events" digest ----

export interface DayEventBlock {
  date: Date
  items: { topic: string; text: string }[]
}

function parseCurrentEvents(wikitext: string): { topic: string; text: string }[] {
  const items: { topic: string; text: string }[] = []
  let topic = ''
  for (const raw of wikitext.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('<!--')) continue
    const header = line.match(/^'''(.+?)'''$/)
    if (header) {
      topic = cleanWikitext(header[1])
      continue
    }
    // Prefer the news detail bullets (** and deeper); skip the bare topic link (*).
    if (line.startsWith('**')) {
      const text = cleanWikitext(line.replace(/^\*+\s*/, ''))
      if (text.length > 12) items.push({ topic, text })
    }
  }
  return items
}

const dayCache = new Map<string, Promise<DayEventBlock | null>>()

function fetchDayEvents(date: Date): Promise<DayEventBlock | null> {
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  const cached = dayCache.get(key)
  if (cached) return cached
  const page = `Portal:Current_events/${date.getFullYear()}_${MONTHS[date.getMonth()]}_${date.getDate()}`
  const p = fetchParse({ action: 'parse', page, prop: 'wikitext' })
    .then((j) => {
      const parse = j.parse as { wikitext?: string } | undefined
      if (!parse?.wikitext) return null
      const items = parseCurrentEvents(parse.wikitext)
      return items.length ? { date, items } : null
    })
    .catch(() => null)
  dayCache.set(key, p)
  return p
}

// ---- yearly "major events" ----

export interface MajorEvent {
  date: Date
  text: string
}

function parseYearEvents(wikitext: string, year: number): MajorEvent[] {
  const out: MajorEvent[] = []
  let curDate: Date | null = null
  for (const raw of wikitext.split('\n')) {
    const line = raw.trim()
    const monthHeader = line.match(/^===+\s*([A-Z][a-z]+)\s*===+$/)
    if (monthHeader) {
      curDate = null
      continue
    }
    const dateLink = line.match(/^\*\s*\[\[([A-Z][a-z]+)\s+(\d{1,2})\]\]/)
    if (dateLink) {
      const mi = MONTHS.indexOf(dateLink[1])
      if (mi >= 0) {
        curDate = new Date(year, mi, Number(dateLink[2]))
        const after = line.replace(/^\*\s*\[\[[A-Z][a-z]+\s+\d{1,2}\]\]/, '').replace(/^\s*[–—-]\s*/, '')
        const t = cleanWikitext(after)
        if (t.length > 12) out.push({ date: curDate, text: t })
      }
      continue
    }
    if (line.startsWith('**') && curDate) {
      const t = cleanWikitext(line.replace(/^\*+\s*/, ''))
      if (t.length > 12) out.push({ date: curDate, text: t })
    }
  }
  return out
}

const yearCache = new Map<number, Promise<MajorEvent[]>>()

function fetchYearEvents(year: number): Promise<MajorEvent[]> {
  const cached = yearCache.get(year)
  if (cached) return cached
  const p = fetchParse({ action: 'parse', page: String(year), prop: 'sections' })
    .then((secJ) => {
      const sections = (secJ.parse as { sections?: { index: string; line: string }[] } | undefined)?.sections
      const idx = sections?.find((s) => /^events$/i.test(s.line))?.index
      if (!idx) return []
      return fetchParse({ action: 'parse', page: String(year), section: idx, prop: 'wikitext' }).then(
        (j) => parseYearEvents((j.parse as { wikitext?: string }).wikitext ?? '', year),
      )
    })
    .catch(() => [])
  yearCache.set(year, p)
  return p
}

// ---- strategy ----

export type RangeEvents =
  | { kind: 'daily'; blocks: DayEventBlock[] }
  | { kind: 'major'; events: MajorEvent[] }

const DAILY_SPAN_LIMIT = 10 // days

function addDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
}

export async function fetchEventsForRange(range: DateRange): Promise<RangeEvents> {
  const spanDays = Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1

  if (spanDays <= DAILY_SPAN_LIMIT) {
    const days: Date[] = []
    for (let d = new Date(range.start); d <= range.end; d = addDay(d)) days.push(new Date(d))
    const blocks = (await Promise.all(days.map(fetchDayEvents))).filter(
      (b): b is DayEventBlock => b !== null,
    )
    return { kind: 'daily', blocks }
  }

  const years: number[] = []
  for (let y = range.start.getFullYear(); y <= range.end.getFullYear(); y++) years.push(y)
  const all = (await Promise.all(years.map(fetchYearEvents))).flat()
  const events = all
    .filter((e) => e.date >= range.start && e.date <= range.end)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  return { kind: 'major', events }
}
