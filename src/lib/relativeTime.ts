// Format an ISO timestamp as a compact "X units ago" string.
// Returns 'unknown' for empty/invalid input and 'just now' for the future
// or sub-second differences.
export function formatRelative(iso: string, now: number = Date.now()): string {
  if (!iso) return 'unknown'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'unknown'

  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 1) return 'just now'

  const units: [limitInSeconds: number, secondsPerUnit: number, label: string][] = [
    [60, 1, 'second'],
    [3600, 60, 'minute'],
    [86400, 3600, 'hour'],
    [2592000, 86400, 'day'], // up to ~30 days
    [31536000, 2592000, 'month'], // up to ~12 months
    [Infinity, 31536000, 'year'],
  ]

  for (const [limit, perUnit, label] of units) {
    if (diffSec < limit) {
      const value = Math.floor(diffSec / perUnit)
      return `${value} ${label}${value === 1 ? '' : 's'} ago`
    }
  }
  return 'unknown'
}
