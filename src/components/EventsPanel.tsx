import { useEffect, useState } from 'react'
import { fetchEventsForRange, type RangeEvents } from '../lib/events'
import type { DateRange } from '../lib/dateRange'

interface Props {
  range: DateRange
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

export function EventsPanel({ range }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })

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
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Global events</h2>
        <span className="text-xs text-slate-400">
          {shortFmt.format(range.start)} – {shortFmt.format(range.end)} · source: Wikipedia
        </span>
      </div>

      {state.status === 'loading' && (
        <div className="py-6 text-center text-sm text-slate-400">Loading events…</div>
      )}
      {state.status === 'error' && (
        <div className="py-6 text-center text-sm text-red-500">{state.message}</div>
      )}
      {state.status === 'ready' && <EventsBody data={state.data} />}
    </section>
  )
}

function EventsBody({ data }: { data: RangeEvents }) {
  if (data.kind === 'daily') {
    if (data.blocks.length === 0) {
      return <div className="py-6 text-center text-sm text-slate-400">No events found for this range.</div>
    }
    return (
      <div className="flex flex-col gap-4">
        {data.blocks.map((b) => (
          <div key={b.date.getTime()}>
            <h3 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              {dayFmt.format(b.date)}
            </h3>
            <ul className="flex flex-col gap-1">
              {b.items.map((it, i) => (
                <li key={i} className="text-sm text-slate-600 dark:text-slate-300">
                  {it.topic && (
                    <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {it.topic}
                    </span>
                  )}
                  {it.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    )
  }

  // major events (long ranges)
  if (data.events.length === 0) {
    return <div className="py-6 text-center text-sm text-slate-400">No major events found for this range.</div>
  }
  const shown = data.events.slice(0, MAJOR_CAP)
  const extra = data.events.length - shown.length
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {shown.map((e, i) => (
          <li key={i} className="flex gap-3 text-sm">
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
