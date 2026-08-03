// "brasov" → "Brasov"
export function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}

// "weather" → "Weather", "natural-gas" → "Natural Gas"
export function prettyCategory(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(capitalize)
    .join(' ')
}

// Human label for a series, e.g. "Brasov · Mean temperature". Callers pass the
// column's display label (from metricMeta) as `columnLabel`, prefixed by the
// city/category. (Kept dependency-free to avoid a cycle with metricMeta.)
export function seriesLabel(cityOrCategory: string, columnLabel: string): string {
  return `${capitalize(cityOrCategory)} · ${columnLabel}`
}
