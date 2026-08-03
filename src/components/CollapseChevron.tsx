// The collapse/expand toggle shared by every panel header: a rotating chevron.
// Down (▾) = expanded; rotated to point right = collapsed.
export function CollapseChevron({
  collapsed,
  onClick,
  label,
}: {
  collapsed: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${label ?? 'panel'}`}
      title={collapsed ? 'Expand' : 'Collapse'}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <span className={'leading-none transition-transform ' + (collapsed ? '-rotate-90' : '')}>▾</span>
    </button>
  )
}
