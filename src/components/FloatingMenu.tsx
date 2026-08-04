import { useEffect, useRef, useState } from 'react'
import { applyToken, collectConfig, extractToken, shareLink } from '../lib/shareConfig'
import { useTheme } from '../hooks/useTheme'
import { formatRelative } from '../lib/relativeTime'

// Floating pill anchored to the bottom-right corner. Left to right:
//  • Share  — mobile: opens the native share sheet with the config URL;
//             desktop: copies the URL (…?s=<config>) to the clipboard.
//  • Theme  — light/dark toggle.
//  • Deploy — "DEPLOYED" label above a live "X ago" timestamp.
//  • Expand — chevron opening a panel with Copy/Paste settings + commit time.
// The uploaded sales data is never included in the shared config; pasted
// sales-metric selections only take effect for datasets the recipient already
// has locally (see shareConfig).

// A timestamp that re-renders every second so its "X ago" label stays live.
function RelativeTime({ iso }: { iso: string }) {
  const [, force] = useState(0)

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const absolute = iso ? new Date(iso).toLocaleString() : 'unknown'
  return (
    <time
      dateTime={iso}
      title={absolute}
      className="font-medium tabular-nums text-slate-700 dark:text-slate-200"
    >
      {formatRelative(iso)}
    </time>
  )
}

type Status = { text: string; tone: 'ok' | 'err' } | null

export function FloatingMenu() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  const flash = (text: string, tone: 'ok' | 'err' = 'ok') => {
    setStatus({ text, tone })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus(null), 2500)
  }
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const copyText = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  const onShare = async () => {
    const url = shareLink()
    const mobile = window.matchMedia('(max-width: 767px)').matches
    if (mobile && typeof navigator.share === 'function') {
      try {
        await navigator.share({ url })
      } catch {
        // Share sheet dismissed — nothing to report.
      }
      return
    }
    const ok = await copyText(url)
    flash(ok ? 'Share link copied' : 'Copy blocked by browser', ok ? 'ok' : 'err')
  }

  const onCopy = async () => {
    const ok = await copyText(collectConfig())
    flash(ok ? 'Settings copied' : 'Copy blocked by browser', ok ? 'ok' : 'err')
  }

  const onPaste = async () => {
    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch {
      // Some browsers block programmatic clipboard reads — ask the user to paste.
      text = window.prompt('Paste the settings string or share link:') ?? ''
    }
    const token = extractToken(text)
    if (token && applyToken(token)) flash('Settings applied')
    else flash('Nothing valid to paste', 'err')
  }

  const iconBtn =
    'inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors ' +
    'hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100'

  const panelBtn =
    'flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ' +
    'hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'

  const statusLine = status && (
    <span
      role="status"
      className={
        'text-xs font-medium ' +
        (status.tone === 'ok'
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-red-600 dark:text-red-400')
      }
    >
      {status.text}
    </span>
  )

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-64 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/90">
          {status && <div className="mb-2">{statusLine}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCopy}
              className={panelBtn}
              title="Copy all settings to the clipboard"
            >
              Copy settings
            </button>
            <button
              type="button"
              onClick={onPaste}
              className={panelBtn}
              title="Apply settings from the clipboard (accepts a settings string or a share link)"
            >
              Paste settings
            </button>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs">
            <span className="text-slate-400 dark:text-slate-500">Commit</span>
            <RelativeTime iso={__COMMIT_DATE__} />
          </div>
        </div>
      )}

      {!open && status && (
        <div className="absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/90">
          {statusLine}
        </div>
      )}

      <div className="flex items-center gap-0.5 rounded-full border border-slate-200 bg-white/80 py-1 pl-1.5 pr-1 shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
        <button
          type="button"
          onClick={onShare}
          aria-label="Share this view"
          title="Share this view (copies a link with the current settings)"
          className={iconBtn}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          className={iconBtn}
        >
          {isDark ? (
            // Sun icon
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            // Moon icon
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        <div className="flex flex-col items-start px-2 leading-tight">
          <span className="text-[8px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Deployed
          </span>
          <span className="text-xs">
            <RelativeTime iso={__BUILD_DATE__} />
          </span>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Collapse menu' : 'Expand menu'}
          aria-expanded={open}
          title={open ? 'Collapse' : 'More (copy/paste settings)'}
          className={iconBtn}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={'h-4 w-4 transition-transform ' + (open ? 'rotate-180' : '')}
          >
            <path d="m18 15-6-6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
