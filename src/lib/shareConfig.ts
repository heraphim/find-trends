// Share / import of the whole dashboard config (the `ft.*` localStorage keys).
//
// Everything the user configures already persists to localStorage under `ft.*`
// (see usePersistedState + Dashboard). So a "share" is just a snapshot of those
// keys, and an "apply" writes them back and pings every usePersistedState to
// re-read (FT_SYNC_EVENT) — no page reload, no coupling to Dashboard state.
//
// The uploaded sales *data* (`ft.sales`) is deliberately NEVER shared: it can be
// large and is the user's private file. Only the sales-metric *selections*
// (`ft.salesSel`) travel, and on apply they're filtered to datasets the
// recipient actually has locally — so a shared view lights up a matching upload
// but never references a dataset the recipient doesn't own.

// The config keys that travel in a share. `ft.sales` (the uploaded rows) is
// intentionally absent. `ft.salesSel` rides along but is filtered on apply.
export const SHARE_KEYS = [
  'ft.cities',
  'ft.overlap',
  'ft.scale',
  'ft.gran',
  'ft.rangeMode',
  'ft.salesAgg',
  'ft.eventSources',
  'ft.citySel',
  'ft.globalSel',
  'ft.salesSel',
  'ft.colors',
  'ft.filters',
  'ft.range',
  'ft.zoom',
] as const

const SALES_DATA_KEY = 'ft.sales' // never shared
const SALES_SEL_KEY = 'ft.salesSel' // shared, but filtered to available datasets

// URL query param carrying the compact config token.
export const SHARE_PARAM = 's'

// Fired after a config is written to localStorage so every usePersistedState
// instance re-reads its key (same-tab; the native `storage` event only fires
// across tabs).
export const FT_SYNC_EVENT = 'ft-config-sync'

const SHARE_VERSION = 1

interface Snapshot {
  v: number
  k: Record<string, string | null> // raw localStorage strings; null = key unset
}

// ---- base64url (UTF-8 safe) ----

function toB64Url(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
  const bin = atob(b64 + pad)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

// ---- collect / encode ----

// Snapshot every shared key (null for keys the sharer never set), so applying a
// share faithfully reproduces the view rather than merging onto the recipient's.
export function collectConfig(): string {
  const k: Record<string, string | null> = {}
  for (const key of SHARE_KEYS) k[key] = readLS(key)
  const snap: Snapshot = { v: SHARE_VERSION, k }
  return toB64Url(JSON.stringify(snap))
}

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLS(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* ignore quota */
  }
}

// ---- decode / apply ----

function decode(token: string): Snapshot | null {
  try {
    const snap = JSON.parse(fromB64Url(token.trim())) as Snapshot
    if (!snap || typeof snap !== 'object' || !snap.k) return null
    return snap
  } catch {
    return null
  }
}

// Dataset ids the recipient currently has locally (from the un-shared ft.sales).
function availableDatasetIds(): Set<string> {
  const raw = readLS(SALES_DATA_KEY)
  if (!raw) return new Set()
  try {
    const arr = JSON.parse(raw) as { id?: string }[]
    return new Set(arr.map((d) => d.id).filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

// Keep only `${dsId}::${metric}` selections whose dataset the recipient has.
function filterSalesSel(raw: string | null): string | null {
  if (!raw) return raw
  const ids = availableDatasetIds()
  try {
    const keys = JSON.parse(raw) as string[]
    const kept = keys.filter((k) => ids.has(k.split('::')[0]))
    return JSON.stringify(kept)
  } catch {
    return raw
  }
}

// Write a decoded snapshot to localStorage and notify the app to re-read.
// Returns false if the token was malformed.
export function applyToken(token: string): boolean {
  const snap = decode(token)
  if (!snap) return false
  for (const key of SHARE_KEYS) {
    if (!(key in snap.k)) continue
    let value = snap.k[key]
    if (key === SALES_SEL_KEY) value = filterSalesSel(value)
    writeLS(key, value)
  }
  try {
    window.dispatchEvent(new Event(FT_SYNC_EVENT))
  } catch {
    /* SSR / no window */
  }
  return true
}

// Accept a bare token OR a full share URL / query string and pull the token out.
export function extractToken(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  const at = s.indexOf(`${SHARE_PARAM}=`)
  if (at >= 0) {
    const rest = s.slice(at + SHARE_PARAM.length + 1)
    const tok = rest.split(/[&#\s]/)[0]
    return tok || null
  }
  return s // assume the whole string is the token
}

// A shareable link to the current app URL carrying the given/current config.
export function shareLink(token = collectConfig()): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}?${SHARE_PARAM}=${token}`
}

// On startup: if the URL carries `?s=`, apply it and strip the param so a
// reload/bookmark doesn't keep re-applying a stale snapshot. Call BEFORE React
// mounts so usePersistedState initializers read the freshly-written values.
export function applyShareFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search)
    const token = params.get(SHARE_PARAM)
    if (!token) return
    applyToken(token)
    params.delete(SHARE_PARAM)
    const qs = params.toString()
    const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
    window.history.replaceState(null, '', url)
  } catch {
    /* ignore malformed URLs */
  }
}
