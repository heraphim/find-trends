import { useEffect, useRef, useState } from 'react'
import type { SidebarCategory } from './Sidebar'
import { columnMeta } from '../lib/metricMeta'
import { SOURCE_LABEL, type EventSource } from '../lib/eventsData'
import { useCollapsed } from '../hooks/useCollapsed'
import { CollapseChevron } from './CollapseChevron'

const EVENTS_KEY = '__events__'
const EVENT_SOURCES: EventSource[] = ['local', 'romania', 'global']

interface Props {
  categories: SidebarCategory[]
  isSelected: (cat: SidebarCategory, col: string) => boolean
  selectedCount: (cat: SidebarCategory) => number
  onToggleColumn: (cat: SidebarCategory, col: string) => void
  onOpenCategory: (catKey: string) => void // lazy-load the category's sheets
  eventSources: Set<string>
  onToggleEventSource: (s: EventSource) => void
}

function Chevron({ open }: { open: boolean }) {
  return <span className={'text-slate-400 transition-transform ' + (open ? 'rotate-180' : '')}>▾</span>
}

function CountBadge({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{n}</span>
  )
}

// One checkbox row for a metric column (labelled via the display registry).
function MetricRow({
  cat,
  col,
  isSelected,
  onToggleColumn,
}: {
  cat: SidebarCategory
  col: string
  isSelected: (cat: SidebarCategory, col: string) => boolean
  onToggleColumn: (cat: SidebarCategory, col: string) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
      <input
        type="checkbox"
        checked={isSelected(cat, col)}
        onChange={() => onToggleColumn(cat, col)}
        className="h-3.5 w-3.5 accent-blue-600"
      />
      <span className="truncate text-slate-700 dark:text-slate-200">{columnMeta(col).label}</span>
    </label>
  )
}

// The metric checkbox list shown inside a category's popover. Primary metrics
// show by default; advanced ones sit behind a per-popover "Show advanced" toggle
// (selected advanced metrics stay visible so they can be unchecked).
function MetricList({
  cat,
  isSelected,
  onToggleColumn,
}: {
  cat: SidebarCategory
  isSelected: (cat: SidebarCategory, col: string) => boolean
  onToggleColumn: (cat: SidebarCategory, col: string) => void
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  if (cat.status === 'loading') return <div className="px-3 py-2 text-xs text-slate-400">Loading…</div>
  if (cat.status === 'error')
    return <div className="px-3 py-2 text-xs text-red-500">{cat.message ?? 'Failed to load.'}</div>
  if (cat.metrics.length === 0)
    return <div className="px-3 py-2 text-xs text-slate-400">No metrics.</div>

  const primary = cat.metrics.filter((c) => columnMeta(c).tier === 'primary')
  const advanced = cat.metrics.filter((c) => columnMeta(c).tier !== 'primary')
  const shownAdvanced = showAdvanced ? advanced : advanced.filter((c) => isSelected(cat, c))
  const hiddenAdvancedCount = advanced.length - shownAdvanced.length

  return (
    <div className="max-h-72 overflow-y-auto p-1">
      {primary.map((col) => (
        <MetricRow key={col} cat={cat} col={col} isSelected={isSelected} onToggleColumn={onToggleColumn} />
      ))}
      {shownAdvanced.map((col) => (
        <MetricRow key={col} cat={cat} col={col} isSelected={isSelected} onToggleColumn={onToggleColumn} />
      ))}
      {advanced.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-1 flex w-full items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {showAdvanced ? 'Hide advanced' : `Show advanced${hiddenAdvancedCount > 0 ? ` (${hiddenAdvancedCount})` : ''}`}
        </button>
      )}
    </div>
  )
}

// One button + its dropdown popover.
function BarItem({
  label,
  count,
  badge,
  open,
  onToggle,
  children,
}: {
  label: string
  count: number
  badge?: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={
          'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ' +
          (open
            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-300'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800')
        }
      >
        {label}
        {badge && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {badge}
          </span>
        )}
        <CountBadge n={count} />
        <Chevron open={open} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {children}
        </div>
      )}
    </div>
  )
}

export function CategoryBar({
  categories,
  isSelected,
  selectedCount,
  onToggleColumn,
  onOpenCategory,
  eventSources,
  onToggleEventSource,
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [collapsed, toggleCollapsed] = useCollapsed('categories')
  const ref = useRef<HTMLDivElement>(null)

  const totalSelected =
    categories.reduce((n, cat) => n + selectedCount(cat), 0) + eventSources.size

  // Close on outside click or Escape.
  useEffect(() => {
    if (openKey === null) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenKey(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenKey(null)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openKey])

  const toggle = (key: string, onOpen?: () => void) =>
    setOpenKey((cur) => {
      const next = cur === key ? null : key
      if (next === key) onOpen?.()
      return next
    })

  return (
    <div
      ref={ref}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
    >
      <CollapseChevron collapsed={collapsed} onClick={toggleCollapsed} label="categories" />
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Categories</span>

      {collapsed && (
        <span className="text-xs text-slate-400">
          {totalSelected === 0 ? 'nothing selected' : `${totalSelected} selected`}
        </span>
      )}

      {!collapsed && categories.map((cat) => (
        <BarItem
          key={cat.key}
          label={cat.title}
          badge={cat.isGlobal ? 'global' : undefined}
          count={selectedCount(cat)}
          open={openKey === cat.key}
          onToggle={() => toggle(cat.key, () => onOpenCategory(cat.key))}
        >
          <MetricList cat={cat} isSelected={isSelected} onToggleColumn={onToggleColumn} />
        </BarItem>
      ))}

      {/* Curated events — sources, not metrics. */}
      {!collapsed && (
      <BarItem
        label="Events"
        count={eventSources.size}
        open={openKey === EVENTS_KEY}
        onToggle={() => toggle(EVENTS_KEY)}
      >
        <div className="p-1">
          {EVENT_SOURCES.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <input
                type="checkbox"
                checked={eventSources.has(s)}
                onChange={() => onToggleEventSource(s)}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              <span className="text-slate-700 dark:text-slate-200">{SOURCE_LABEL[s]}</span>
              {s === 'local' && (
                <span className="ml-auto text-[10px] text-slate-400">selected cities</span>
              )}
            </label>
          ))}
        </div>
      </BarItem>
      )}
    </div>
  )
}
