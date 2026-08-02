import type { Theme } from '../hooks/useTheme'

// Validated data-viz categorical palette (colorblind-safe), stepped per surface.
// Assigned in fixed order to selected series — never cycled cosmetically.
const CATEGORICAL_LIGHT = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
]
const CATEGORICAL_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
]

// Canonical distinct default colors assigned to series in order (theme-neutral
// enough to read on both surfaces; users can override per series via the picker).
export const DEFAULT_SERIES_COLORS = CATEGORICAL_LIGHT

export function chartColors(theme: Theme) {
  const dark = theme === 'dark'
  const categorical = dark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT
  return {
    categorical,
    series1: categorical[0],
    series2: categorical[1],
    grid: dark ? '#2c2c2a' : '#e1e0d9',
    axis: '#898781',
    ink: dark ? '#ffffff' : '#0b0b0b',
    inkMuted: dark ? '#c3c2b7' : '#52514e',
    surface: dark ? '#1a1a19' : '#fcfcfb',
    border: dark ? 'rgba(255,255,255,0.10)' : 'rgba(11,11,11,0.10)',
  }
}

// Categorical hue for the Nth selected series (wraps past 8 as a fallback).
export function seriesColor(theme: Theme, index: number): string {
  const c = chartColors(theme).categorical
  return c[index % c.length]
}
