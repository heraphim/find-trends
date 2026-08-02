import type { SheetData } from '../lib/data'
import { prettyCategory } from '../lib/labels'
import type { ParsedTab } from '../lib/workbook'

export type SheetState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SheetData }

interface Props {
  categories: ParsedTab[]
  expanded: Set<string>
  getSheetState: (sheet: string) => SheetState
  selected: Set<string>
  onToggleExpand: (sheet: string) => void
  onToggleColumn: (sheet: string, column: string) => void
}

function selKey(sheet: string, column: string): string {
  return `${sheet}::${column}`
}

function CategoryPanel({
  tab,
  state,
  selected,
  onToggleColumn,
}: {
  tab: ParsedTab
  state: SheetState
  selected: Set<string>
  onToggleColumn: (sheet: string, column: string) => void
}) {
  if (state.status === 'loading' || state.status === 'idle') {
    return <div className="px-3 py-2 text-xs text-slate-400">Loading columns…</div>
  }
  if (state.status === 'error') {
    return <div className="px-3 py-2 text-xs text-red-500">{state.message}</div>
  }

  const metrics = state.data.columns.filter((c) => c.kind === 'metric')
  const events = state.data.columns.filter((c) => c.kind === 'event')

  return (
    <div className="max-h-72 overflow-y-auto px-1 py-1">
      {metrics.map((col) => {
        const key = selKey(tab.sheet, col.key)
        return (
          <label
            key={key}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <input
              type="checkbox"
              checked={selected.has(key)}
              onChange={() => onToggleColumn(tab.sheet, col.key)}
              className="h-3.5 w-3.5 accent-blue-600"
            />
            <span className="truncate text-slate-700 dark:text-slate-200">{col.key}</span>
          </label>
        )
      })}

      {events.length > 0 && (
        <>
          <div className="mt-2 flex items-center gap-2 px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Events
            <span className="rounded bg-slate-200 px-1 py-px text-[9px] font-normal normal-case text-slate-500 dark:bg-slate-700 dark:text-slate-300">
              day markers · soon
            </span>
          </div>
          {events.map((col) => (
            <label
              key={selKey(tab.sheet, col.key)}
              className="flex items-center gap-2 rounded px-2 py-1 text-sm opacity-60"
              title="Event overlays are coming in the next step"
            >
              <input type="checkbox" disabled className="h-3.5 w-3.5" />
              <span className="truncate text-slate-500 dark:text-slate-400">{col.key}</span>
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
  getSheetState,
  selected,
  onToggleExpand,
  onToggleColumn,
}: Props) {
  return (
    <aside className="w-full shrink-0 md:w-72">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Categories
      </h2>
      <div className="flex flex-col gap-2">
        {categories.map((tab) => {
          const isOpen = expanded.has(tab.sheet)
          const state = getSheetState(tab.sheet)
          const selectedCount =
            state.status === 'ready'
              ? state.data.columns.filter((c) => selected.has(selKey(tab.sheet, c.key))).length
              : 0
          return (
            <div
              key={tab.sheet}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() => onToggleExpand(tab.sheet)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={
                      'text-slate-400 transition-transform ' + (isOpen ? 'rotate-90' : '')
                    }
                  >
                    ▶
                  </span>
                  {prettyCategory(tab.category)}
                  {tab.city === null && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      global
                    </span>
                  )}
                </span>
                {selectedCount > 0 && (
                  <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {selectedCount}
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="border-t border-slate-100 dark:border-slate-800">
                  <CategoryPanel
                    tab={tab}
                    state={state}
                    selected={selected}
                    onToggleColumn={onToggleColumn}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
