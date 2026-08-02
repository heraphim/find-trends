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

// Human label for a series: "Brasov · temp_mean" / "Commodities · Gold_close".
// Column keys are left as-is (precise) except underscores are kept for clarity.
export function seriesLabel(cityOrCategory: string, column: string): string {
  return `${capitalize(cityOrCategory)} · ${column}`
}
