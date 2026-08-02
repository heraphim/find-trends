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
    <time dateTime={iso} title={absolute}>
      {formatRelative(iso)}
    </time>
  )
}

export function BuildInfo() {
  return (
    <dl className="build-info">
      <div>
        <dt>Last commit</dt>
        <dd>
          <RelativeTime iso={__COMMIT_DATE__} />
        </dd>
      </div>
      <div>
        <dt>Deployed</dt>
        <dd>
          <RelativeTime iso={__BUILD_DATE__} />
        </dd>
      </div>
    </dl>
  )
}
