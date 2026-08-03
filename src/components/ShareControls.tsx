import { useEffect, useRef, useState } from 'react'
import { applyToken, collectConfig, extractToken, shareLink } from '../lib/shareConfig'

// Header buttons to move the whole dashboard config around:
//  • Copy    — the config as a compact string on the clipboard
//  • Paste   — apply a config string (or a share URL) from the clipboard
//  • Link    — a shareable URL (…?s=<config>) on the clipboard
// The uploaded sales data is never included; pasted sales-metric selections only
// take effect for datasets the recipient already has locally (see shareConfig).

type Status = { text: string; tone: 'ok' | 'err' } | null

export function ShareControls() {
  const [status, setStatus] = useState<Status>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const onCopy = async () => {
    const ok = await copyText(collectConfig())
    flash(ok ? 'Settings copied' : 'Copy blocked by browser', ok ? 'ok' : 'err')
  }

  const onLink = async () => {
    const ok = await copyText(shareLink())
    flash(ok ? 'Share link copied' : 'Copy blocked by browser', ok ? 'ok' : 'err')
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

  const btn =
    'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ' +
    'hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'

  return (
    <div className="flex items-center gap-2">
      {status && (
        <span
          className={
            'text-xs font-medium ' +
            (status.tone === 'ok'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400')
          }
          role="status"
        >
          {status.text}
        </span>
      )}
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
        <button type="button" onClick={onCopy} className={btn + ' rounded-none border-0'} title="Copy all settings to the clipboard">
          Copy
        </button>
        <button
          type="button"
          onClick={onPaste}
          className={btn + ' rounded-none border-0 border-l border-slate-300 dark:border-slate-700'}
          title="Apply settings from the clipboard (accepts a settings string or a share link)"
        >
          Paste
        </button>
        <button
          type="button"
          onClick={onLink}
          className={btn + ' rounded-none border-0 border-l border-slate-300 dark:border-slate-700'}
          title="Copy a shareable link with the current settings in the URL"
        >
          Link
        </button>
      </div>
    </div>
  )
}
