import { useEffect, useRef, useState } from 'react'

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

  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) return opts?.deserialize ? opts.deserialize(raw) : (JSON.parse(raw) as T)
    } catch {
      /* fall through to default */
    }
    return typeof initial === 'function' ? (initial as () => T)() : initial
  })

  useEffect(() => {
    try {
      const s = optsRef.current?.serialize
      localStorage.setItem(key, s ? s(state) : JSON.stringify(state))
    } catch {
      /* ignore quota/serialization errors */
    }
  }, [key, state])

  return [state, setState] as const
}

// Serde for Set<string>.
export const setSerde = {
  serialize: (s: Set<string>) => JSON.stringify([...s]),
  deserialize: (raw: string) => new Set<string>(JSON.parse(raw) as string[]),
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
