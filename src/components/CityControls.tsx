import { capitalize } from '../lib/labels'
import { useCollapsed } from '../hooks/useCollapsed'
import { CollapseChevron } from './CollapseChevron'

interface Props {
  cities: string[]
  included: Set<string>
  overlap: boolean
  onToggleCity: (city: string) => void
  onToggleOverlap: () => void
}

export function CityControls({ cities, included, overlap, onToggleCity, onToggleOverlap }: Props) {
  const [collapsed, toggle] = useCollapsed('cities')
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <CollapseChevron collapsed={collapsed} onClick={toggle} label="cities" />
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cities</span>

      {collapsed && (
        <span className="text-xs text-slate-400">
          {included.size}/{cities.length} selected · overlap {overlap ? 'on' : 'off'}
        </span>
      )}

      {!collapsed && (
      <div className="flex flex-wrap gap-1.5">
        {cities.map((c) => {
          const on = included.has(c)
          return (
            <label
              key={c}
              className={
                'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-sm transition-colors ' +
                (on
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-300'
                  : 'border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400')
              }
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => onToggleCity(c)}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              {capitalize(c)}
            </label>
          )
        })}
      </div>
      )}

      {!collapsed && (
        <label
          className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
          title="On: cities share one chart. Off: one chart per city, stacked."
        >
          <input
            type="checkbox"
            checked={overlap}
            onChange={onToggleOverlap}
            className="h-4 w-4 accent-blue-600"
          />
          Overlap
        </label>
      )}
    </div>
  )
}
