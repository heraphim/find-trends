import { useEffect, useState } from 'react'
import { fetchEventsForRange, type RangeEvents, type Tier } from '../lib/events'
import type { DateRange } from '../lib/dateRange'
import { usePersistedState } from '../hooks/usePersistedState'

const TIER_STYLE: Record<Tier, string> = {
  major: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  notable: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  minor: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

function TierTag({ tier }: { tier: Tier }) {
  return (
    <span
      className={
        'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ' +
        TIER_STYLE[tier]
      }
    >
      {tier}
    </span>
  )
}

interface Props {
  range: DateRange
  focused?: boolean
  onClear?: () => void
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: RangeEvents }

const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const shortFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

const MAJOR_CAP = 150

export function EventsPanel({ range, focused, onClear }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [importantOnly, setImportantOnly] = usePersistedState('ft.importantOnly', true)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetchEventsForRange(range)
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch((e: unknown) =>
        !cancelled &&
        setState({ status: 'error', message: e instanceof Error ? e.message : 'Failed to load events.' }),
      )
    return () => {
      cancelled = true
    }
  }, [range.start.getTime(), range.end.getTime()])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          Global events
          {focused && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              selected point
            </span>
          )}
        </h2>
        <span className="text-xs text-slate-400">
          {shortFmt.format(range.start)} – {shortFmt.format(range.end)} · source: Wikipedia
          {focused && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="ml-2 rounded border border-slate-300 px-1.5 py-0.5 font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              clear
            </button>
          )}
        </span>
      </div>
      <div className="-mt-2 mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          {focused ? 'Ranked by estimated importance.' : 'Tip: click a point in the chart to see that day/period.'}
        </p>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={importantOnly}
            onChange={() => setImportantOnly((v) => !v)}
            className="h-3.5 w-3.5 accent-blue-600"
          />
          Important only
        </label>
      </div>

      {state.status === 'loading' && (
        <div className="py-6 text-center text-sm text-slate-400">Loading events…</div>
      )}
      {state.status === 'error' && (
        <div className="py-6 text-center text-sm text-red-500">{state.message}</div>
      )}
      {state.status === 'ready' && <EventsBody data={state.data} importantOnly={importantOnly} />}
    </section>
  )
}

function EventsBody({ data, importantOnly }: { data: RangeEvents; importantOnly: boolean }) {
  const keep = (tier: Tier) => !importantOnly || tier !== 'minor'

  if (data.kind === 'daily') {
    const blocks = data.blocks
      .map((b) => ({ date: b.date, items: b.items.filter((it) => keep(it.tier)) }))
      .filter((b) => b.items.length > 0)
    if (blocks.length === 0) {
      return (
        <div className="py-6 text-center text-sm text-slate-400">
          {importantOnly ? 'No notable events — untick “Important only” to see all.' : 'No events found for this range.'}
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-4">
        {blocks.map((b) => (
          <div key={b.date.getTime()}>
            <h3 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              {dayFmt.format(b.date)}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {b.items.map((it, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                  <TierTag tier={it.tier} />
                  <span>
                    {it.topic && (
                      <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {it.topic}
                      </span>
                    )}
                    {it.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    )
  }

  // major events (long ranges)
  const events = data.events.filter((e) => keep(e.tier))
  if (events.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-slate-400">
        {importantOnly ? 'No notable events — untick “Important only” to see all.' : 'No major events found for this range.'}
      </div>
    )
  }
  const shown = events.slice(0, MAJOR_CAP)
  const extra = events.length - shown.length
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {shown.map((e, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <TierTag tier={e.tier} />
            <span className="w-24 shrink-0 tabular-nums text-slate-400">{shortFmt.format(e.date)}</span>
            <span className="text-slate-600 dark:text-slate-300">{e.text}</span>
          </li>
        ))}
      </ul>
      {extra > 0 && (
        <p className="mt-3 text-xs text-slate-400">
          + {extra.toLocaleString()} more — narrow the range to see them.
        </p>
      )}
    </>
  )
}
