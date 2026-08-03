// A cache-busting version stamp appended to every same-origin resource fetch
// (the data manifest, the trend/day CSVs, and the curated-event CSVs). Each
// deployment gets a fresh stamp — and because the nightly data refresh chains a
// redeploy (see CLAUDE.md), fresh data always ships under a new URL, so the
// browser/CDN never serves a stale copy and no manual hard-reload is needed.
//
// The value is derived from the build timestamp (frozen at dev-server start
// under `npm run dev`, so it's stable across a dev session).
export const APP_VERSION = (() => {
  const raw = (typeof __BUILD_DATE__ === 'string' && __BUILD_DATE__) ||
    (typeof __COMMIT_DATE__ === 'string' && __COMMIT_DATE__) ||
    'dev'
  const t = Date.parse(raw)
  return Number.isNaN(t) ? encodeURIComponent(raw) : String(t)
})()

// Append `?v=<APP_VERSION>` to a same-origin URL, preserving any existing query.
export function withVersion(url: string): string {
  return url + (url.includes('?') ? '&' : '?') + 'v=' + APP_VERSION
}
