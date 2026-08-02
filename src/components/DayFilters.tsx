import { prettyCategory } from '../lib/labels'
import type { FilterDimension } from '../lib/dayFilters'

interface Props {
  dimensions: FilterDimension[]
  state: Record<string, Set<string>>
  onToggle: (column: string, value: string) => void
}

// "is_weekend" → "Weekend", "is_weekday" → "Weekday", "season" → "Season"
function groupLabel(col: string): string {
  return prettyCategory(col.replace(/^is_/, ''))
}

function valueLabel(v: string): string {
  if (v === 'TRUE') return 'Yes'
  if (v === 'FALSE') return 'No'
  return v
}

export function DayFilters({ dimensions, state, onToggle }: Props) {
  if (dimensions.length === 0) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Day filters
      </h2>
      <div className="flex flex-col gap-3">
        {dimensions.map((dim) => (
          <div key={dim.column}>
            <div className="mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {groupLabel(dim.column)}
            </div>
            <div className="flex flex-wrap gap-1">
              {dim.values.map((v) => {
                const checked = state[dim.column]?.has(v) ?? true
                return (
                  <label
                    key={v}
                    className={
                      'flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors ' +
                      (checked
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-300'
                        : 'border-slate-300 text-slate-400 line-through dark:border-slate-700 dark:text-slate-500')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(dim.column, v)}
                      className="h-3 w-3 accent-blue-600"
                    />
                    {valueLabel(v)}
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
