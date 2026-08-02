import { useEffect, useState } from 'react'
import { formatRelative } from '../lib/relativeTime'

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

// Floating pill anchored to the bottom-right corner.
export function BuildInfo() {
  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
      <span className="flex items-center gap-1.5">
        <span className="text-slate-400 dark:text-slate-500">Commit</span>
        <RelativeTime iso={__COMMIT_DATE__} />
      </span>
      <span className="h-3 w-px bg-slate-300 dark:bg-slate-600" />
      <span className="flex items-center gap-1.5">
        <span className="text-slate-400 dark:text-slate-500">Deployed</span>
        <RelativeTime iso={__BUILD_DATE__} />
      </span>
    </div>
  )
}
