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

// ---- importance scoring (heuristic; no LLM/backend) ----

export type Tier = 'major' | 'notable' | 'minor'

// How much each Current-Events topic matters to a general audience.
const TOPIC_WEIGHT: Record<string, number> = {
  'armed conflicts and attacks': 5,
  'disasters and accidents': 5,
  'politics and elections': 4,
  'international relations': 4,
  'law and crime': 3,
  'business and economy': 3,
  'health and environment': 3,
  'health and medicine': 3,
  'science and technology': 2,
  'arts and culture': 1,
  sports: 1,
}

const IMPACT_KEYWORDS = [
  /\bkill/i, /\bdead\b/i, /\bdeaths?\b/i, /\bearthquake\b/i, /\btsunami\b/i,
  /\bwar\b/i, /\binvasion\b/i, /\bcoup\b/i, /\bceasefire\b/i, /\bmissile\b/i,
  /\bairstrike\b/i, /\bnuclear\b/i, /\bpandemic\b/i, /\boutbreak\b/i, /\bresign/i,
  /\belection\b/i, /\bpresident\b/i, /\bprime minister\b/i, /\bsanctions?\b/i,
  /\bflood/i, /\bwildfire/i, /\bhurricane\b/i, /\btyphoon\b/i, /\bcollapse/i,
  /\bbankrupt/i, /\btreaty\b/i, /\bsummit\b/i, /\bassassinat/i, /\bgenocide\b/i,
  /\bevacuat/i, /\bstate of emergency\b/i,
]

function countTrailingSources(text: string): number {
  const m = text.match(/(\s*\([^()]*\))+\s*$/)
  return m ? (m[0].match(/\(/g) || []).length : 0
}

function stripTrailingSources(text: string): string {
  return text.replace(/(\s*\([^()]*\))+\s*$/, '').trim()
}

function casualtyBoost(text: string): number {
  const m = text.match(/([\d,]+)\s+(?:people\s+)?(?:are\s+|were\s+)?(?:killed|dead|die)/i)
  if (!m) return 0
  const n = Number(m[1].replace(/,/g, ''))
  return n > 0 ? Math.min(4, Math.log10(n)) : 0
}

// Score an item: topic weight + impact keywords + casualties + coverage.
function scoreItem(topic: string, cleaned: string, base: number): number {
  const topicW = topic ? (TOPIC_WEIGHT[topic.toLowerCase()] ?? 2) : base
  const impact = IMPACT_KEYWORDS.reduce((n, re) => (re.test(cleaned) ? n + 1 : n), 0)
  const sources = Math.min(3, countTrailingSources(cleaned))
  return topicW + impact + casualtyBoost(cleaned) + sources * 0.5
}

function tierFor(score: number): Tier {
  if (score >= 6) return 'major'
  if (score >= 3.5) return 'notable'
  return 'minor'
}

// ---- daily "current events" digest ----

export interface ScoredItem {
  topic: string
  text: string
  score: number
  tier: Tier
}

export interface DayEventBlock {
  date: Date
  items: ScoredItem[]
}

function parseCurrentEvents(wikitext: string): ScoredItem[] {
  const items: ScoredItem[] = []
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
      const cleaned = cleanWikitext(line.replace(/^\*+\s*/, ''))
      if (cleaned.length > 12) {
        const score = scoreItem(topic, cleaned, 2)
        items.push({ topic, text: stripTrailingSources(cleaned), score, tier: tierFor(score) })
      }
    }
  }
  return items.sort((a, b) => b.score - a.score)
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
  score: number
  tier: Tier
}

// Year-article events have no topic header; treat them as curated (base 3).
function makeMajor(date: Date, text: string): MajorEvent {
  const score = scoreItem('', text, 3)
  return { date, text, score, tier: tierFor(score) }
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
        if (t.length > 12) out.push(makeMajor(curDate, t))
      }
      continue
    }
    if (line.startsWith('**') && curDate) {
      const t = cleanWikitext(line.replace(/^\*+\s*/, ''))
      if (t.length > 12) out.push(makeMajor(curDate, t))
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
