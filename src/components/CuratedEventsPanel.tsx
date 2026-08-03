import type { DateRange } from '../lib/dateRange'
import { SOURCE_LABEL, eventTier, type CuratedEvent } from '../lib/eventsData'
import type { Tier } from '../lib/events'
import { capitalize } from '../lib/labels'

const TIER_STYLE: Record<Tier, string> = {
  major: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  notable: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  minor: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

const POSNEG_DOT: Record<string, string> = {
  Positive: 'bg-emerald-500',
  Negative: 'bg-red-500',
  Mixed: 'bg-amber-500',
}

const shortFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function dateRangeLabel(ev: CuratedEvent): string {
  const s = shortFmt.format(ev.start)
  return ev.end.getTime() === ev.start.getTime() ? s : `${s} – ${shortFmt.format(ev.end)}`
}

interface Props {
  events: CuratedEvent[]
  range: DateRange
  focused?: boolean
  onClear?: () => void
  active: boolean // whether any event source is selected
}

const CAP = 200

export function CuratedEventsPanel({ events, range, focused, onClear, active }: Props) {
  const shown = events.slice(0, CAP)
  const extra = events.length - shown.length

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          Local &amp; regional events
          {focused && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              selected point
            </span>
          )}
        </h2>
        <span className="text-xs text-slate-400">
          {shortFmt.format(range.start)} – {shortFmt.format(range.end)} · your curated data
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

      {!active ? (
        <div className="py-6 text-center text-sm text-slate-400">
          Pick Local / Romania / Global from the <span className="font-medium">Events</span> category to show your events.
        </div>
      ) : shown.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-400">No events in this range.</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {shown.map((ev, i) => {
            const tier = eventTier(ev.importance)
            return (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span
                  className={
                    'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ' +
                    TIER_STYLE[tier]
                  }
                >
                  {tier}
                </span>
                <span className="w-40 shrink-0 tabular-nums text-slate-400">{dateRangeLabel(ev)}</span>
                <span className="text-slate-600 dark:text-slate-300">
                  {ev.posneg && POSNEG_DOT[ev.posneg] && (
                    <span
                      className={'mr-1.5 inline-block h-2 w-2 rounded-full align-middle ' + POSNEG_DOT[ev.posneg]}
                      title={ev.posneg}
                    />
                  )}
                  <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {ev.source === 'local' && ev.city ? capitalize(ev.city) : SOURCE_LABEL[ev.source]}
                  </span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">{ev.name}</span>
                  {ev.description && <span className="text-slate-500 dark:text-slate-400"> — {ev.description}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {extra > 0 && (
        <p className="mt-3 text-xs text-slate-400">+ {extra.toLocaleString()} more — narrow the range to see them.</p>
      )}
    </section>
  )
}
