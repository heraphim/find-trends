import { useEffect, useRef, useState } from 'react'
import { FT_SYNC_EVENT } from '../lib/shareConfig'

interface Options<T> {
  serialize?: (v: T) => string
  deserialize?: (s: string) => T
}

// useState that mirrors to localStorage, so a value survives page reloads.
export function usePersistedState<T>(
  key: string,
  initial: T | (() => T),
  opts?: Options<T>,
) {
  const optsRef = useRef(opts)
  optsRef.current = opts
  const defaultRef = useRef<T>(
    (typeof initial === 'function' ? (initial as () => T)() : initial) as T,
  )

  const read = (): T => {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null)
        return optsRef.current?.deserialize
          ? optsRef.current.deserialize(raw)
          : (JSON.parse(raw) as T)
    } catch {
      /* fall through to default */
    }
    return defaultRef.current
  }

  const [state, setState] = useState<T>(read)

  useEffect(() => {
    try {
      const s = optsRef.current?.serialize
      localStorage.setItem(key, s ? s(state) : JSON.stringify(state))
    } catch {
      /* ignore quota/serialization errors */
    }
  }, [key, state])

  // A shared/imported config writes localStorage then fires FT_SYNC_EVENT; every
  // instance re-reads its key so the whole app snaps to the applied config with
  // no reload. (The native `storage` event is cross-tab only, hence a custom one.)
  useEffect(() => {
    const resync = () => setState(read())
    window.addEventListener(FT_SYNC_EVENT, resync)
    return () => window.removeEventListener(FT_SYNC_EVENT, resync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return [state, setState] as const
}

// Serde for Set<string>.
export const setSerde = {
  serialize: (s: Set<string>) => JSON.stringify([...s]),
  deserialize: (raw: string) => new Set<string>(JSON.parse(raw) as string[]),
}

// Serde for a DateRange, stored as local yyyy-mm-dd (avoids UTC day-shift).
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function fromYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
type DR = { start: Date; end: Date }
export const dateRangeSerde = {
  serialize: (r: DR) => JSON.stringify([ymd(r.start), ymd(r.end)]),
  deserialize: (raw: string) => {
    const [s, e] = JSON.parse(raw) as [string, string]
    return { start: fromYmd(s), end: fromYmd(e) }
  },
}
export const dateRangeArraySerde = {
  serialize: (arr: DR[]) => JSON.stringify(arr.map((r) => [ymd(r.start), ymd(r.end)])),
  deserialize: (raw: string) =>
    (JSON.parse(raw) as [string, string][]).map(([s, e]) => ({ start: fromYmd(s), end: fromYmd(e) })),
}

// Serde for Record<string, Set<string>> (e.g. the day-filter state).
export const setMapSerde = {
  serialize: (m: Record<string, Set<string>>) =>
    JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v]]))),
  deserialize: (raw: string) => {
    const obj = JSON.parse(raw) as Record<string, string[]>
    const out: Record<string, Set<string>> = {}
    for (const k of Object.keys(obj)) out[k] = new Set(obj[k])
    return out
  },
}
