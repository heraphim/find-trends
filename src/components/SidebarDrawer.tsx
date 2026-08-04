import { useEffect } from 'react'

const DESKTOP_MQ = '(min-width: 768px)'

interface Props {
  open: boolean
  onOpen: () => void
  onClose: () => void
  children: React.ReactNode
}

// Slide-in drawer on the left that hosts the dashboard controls (categories,
// day filters, sales). Two interaction modes by screen size:
//  - Mobile (<md): a floating ☰ button pinned to the top-left opens it; close
//    via the ✕, tapping the backdrop, or Escape. The panel leaves a small gap
//    on the right so the page peeks through.
//  - Desktop (md+): hovering the left edge (an invisible strip plus a visible
//    tab pinned mid-screen) opens it; close via the ✕, Escape, or moving the
//    mouse off the panel onto the page.
export function SidebarDrawer({ open, onOpen, onClose, children }: Props) {
  // Escape closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Lock the page scroll behind the open drawer on mobile (the backdrop covers
  // the page there; on desktop the page stays visible next to the panel).
  useEffect(() => {
    if (!open || window.matchMedia(DESKTOP_MQ).matches) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Desktop-only mouse-out close. When the pointer leaves the browser window
  // itself (e.g. a native file dialog opened over it), React reports the
  // relatedTarget as `window` (or null) rather than a page element — keep the
  // drawer open in that case; only moving onto the page closes it.
  const onPanelMouseLeave = (e: React.MouseEvent) => {
    const to: unknown = e.relatedTarget
    if (to instanceof Node && window.matchMedia(DESKTOP_MQ).matches) onClose()
  }

  return (
    <>
      {/* Mobile opener — floats over the page at the top-left, above the header. */}
      {!open && (
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open controls"
          className="fixed left-3 top-3 z-40 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-lg leading-none text-slate-600 shadow-md hover:bg-slate-50 md:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          ☰
        </button>
      )}

      {/* Desktop openers: an invisible hover strip down the whole left edge plus
          a visible tab pinned at the middle of the screen. */}
      <div aria-hidden className="fixed inset-y-0 left-0 z-40 hidden w-1.5 md:block" onMouseEnter={onOpen} />
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={onOpen}
        aria-label="Open controls"
        className="fixed left-0 top-1/2 z-40 hidden h-16 w-6 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-slate-300 bg-white text-slate-400 shadow-md hover:text-slate-700 md:flex dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500 dark:hover:text-slate-200"
      >
        ›
      </button>

      {/* Backdrop — mobile only; tap outside the panel to close. */}
      {open && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 md:hidden" onClick={onClose} aria-hidden />
      )}

      {/* The panel itself. */}
      <aside
        onMouseLeave={onPanelMouseLeave}
        aria-hidden={!open}
        className={
          'fixed inset-y-0 left-0 z-50 flex w-[calc(100%-2.5rem)] max-w-sm flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:w-96 md:max-w-none dark:border-slate-800 dark:bg-slate-950 ' +
          (open ? 'translate-x-0 shadow-xl' : '-translate-x-full')
        }
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Controls</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close controls"
            className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">{children}</div>
      </aside>
    </>
  )
}
