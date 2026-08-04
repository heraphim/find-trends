import { capitalize } from '../lib/labels'

interface Props {
  cities: string[]
  included: Set<string>
  overlap: boolean
  onToggleCity: (city: string) => void
  onToggleOverlap: () => void
}

// Compact inline row — lives in the Trends section title line, centered.
export function CityControls({ cities, included, overlap, onToggleCity, onToggleOverlap }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cities</span>

      <div className="flex flex-wrap justify-center gap-1.5">
        {cities.map((c) => {
          const on = included.has(c)
          return (
            <label
              key={c}
              className={
                'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors ' +
                (on
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-300'
                  : 'border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400')
              }
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => onToggleCity(c)}
                className="h-3 w-3 accent-blue-600"
              />
              {capitalize(c)}
            </label>
          )
        })}
      </div>

      <label
        className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"
        title="On: cities share one chart. Off: one chart per city, stacked."
      >
        <input
          type="checkbox"
          checked={overlap}
          onChange={onToggleOverlap}
          className="h-3.5 w-3.5 accent-blue-600"
        />
        Overlap
      </label>
    </div>
  )
}
