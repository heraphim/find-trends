import {
  EARLIEST,
  PRESETS,
  sameRange,
  today,
  toInputValue,
  fromInputValue,
  type DateRange,
} from '../lib/dateRange'

interface Props {
  value: DateRange
  onChange: (r: DateRange) => void
}

export function DateRangePicker({ value, onChange }: Props) {
  const maxV = toInputValue(today())
  const minV = toInputValue(EARLIEST)

  const inputClass =
    'rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 [color-scheme:light] dark:[color-scheme:dark]'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-sm">
        <input
          type="date"
          aria-label="Start date"
          className={inputClass}
          value={toInputValue(value.start)}
          min={minV}
          max={toInputValue(value.end)}
          onChange={(e) => {
            const d = fromInputValue(e.target.value)
            if (d) onChange({ ...value, start: d })
          }}
        />
        <span className="text-slate-400">→</span>
        <input
          type="date"
          aria-label="End date"
          className={inputClass}
          value={toInputValue(value.end)}
          min={toInputValue(value.start)}
          max={maxV}
          onChange={(e) => {
            const d = fromInputValue(e.target.value)
            if (d) onChange({ ...value, end: d })
          }}
        />
      </div>

      <div className="inline-flex flex-wrap gap-1">
        {PRESETS.map((p) => {
          const active = sameRange(value, p.get())
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(p.get())}
              aria-pressed={active}
              className={
                'rounded-md px-2 py-1 text-xs font-medium transition-colors ' +
                (active
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700')
              }
            >
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
