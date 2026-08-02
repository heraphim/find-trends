import type { SheetData } from '../lib/data'

export type SheetState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SheetData }

export interface SidebarCategory {
  key: string // 'weather' (city category) or a global sheet name
  title: string
  isGlobal: boolean
  status: 'loading' | 'error' | 'ready'
  message?: string
  metrics: string[] // metric column keys (plottable)
  events: string[] // event column keys (day classifiers)
}

interface Props {
  categories: SidebarCategory[]
  expanded: Set<string>
  isSelected: (cat: SidebarCategory, col: string) => boolean
  selectedCount: (cat: SidebarCategory) => number
  onToggleExpand: (catKey: string) => void
  onToggleColumn: (cat: SidebarCategory, col: string) => void
}

function CategoryPanel({
  cat,
  isSelected,
  onToggleColumn,
}: {
  cat: SidebarCategory
  isSelected: (cat: SidebarCategory, col: string) => boolean
  onToggleColumn: (cat: SidebarCategory, col: string) => void
}) {
  if (cat.status === 'loading') {
    return <div className="px-3 py-2 text-xs text-slate-400">Loading columns…</div>
  }
  if (cat.status === 'error') {
    return <div className="px-3 py-2 text-xs text-red-500">{cat.message}</div>
  }

  return (
    <div className="max-h-72 overflow-y-auto px-1 py-1">
      {cat.metrics.map((col) => (
        <label
          key={col}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <input
            type="checkbox"
            checked={isSelected(cat, col)}
            onChange={() => onToggleColumn(cat, col)}
            className="h-3.5 w-3.5 accent-blue-600"
          />
          <span className="truncate text-slate-700 dark:text-slate-200">{col}</span>
        </label>
      ))}

      {cat.events.length > 0 && (
        <>
          <div className="mt-2 flex items-center gap-2 px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Events
            <span className="rounded bg-slate-200 px-1 py-px text-[9px] font-normal normal-case text-slate-500 dark:bg-slate-700 dark:text-slate-300">
              day markers · soon
            </span>
          </div>
          {cat.events.map((col) => (
            <label
              key={col}
              className="flex items-center gap-2 rounded px-2 py-1 text-sm opacity-60"
              title="Event overlays are coming in the next step"
            >
              <input type="checkbox" disabled className="h-3.5 w-3.5" />
              <span className="truncate text-slate-500 dark:text-slate-400">{col}</span>
            </label>
          ))}
        </>
      )}
    </div>
  )
}

export function Sidebar({
  categories,
  expanded,
  isSelected,
  selectedCount,
  onToggleExpand,
  onToggleColumn,
}: Props) {
  return (
    <aside className="w-full">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Categories
      </h2>
      <div className="flex flex-col gap-2">
        {categories.map((cat) => {
          const isOpen = expanded.has(cat.key)
          const count = selectedCount(cat)
          return (
            <div
              key={cat.key}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() => onToggleExpand(cat.key)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={'text-slate-400 transition-transform ' + (isOpen ? 'rotate-90' : '')}
                  >
                    ▶
                  </span>
                  {cat.title}
                  {cat.isGlobal && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      global
                    </span>
                  )}
                </span>
                {count > 0 && (
                  <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {count}
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="border-t border-slate-100 dark:border-slate-800">
                  <CategoryPanel cat={cat} isSelected={isSelected} onToggleColumn={onToggleColumn} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
