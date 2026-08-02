import type { Theme } from '../hooks/useTheme'

// Validated data-viz palette (colorblind-safe), stepped per surface.
// series1 = Google Sheets data, series2 = uploaded CSV (used later).
export function chartColors(theme: Theme) {
  const dark = theme === 'dark'
  return {
    series1: dark ? '#3987e5' : '#2a78d6', // blue
    series2: dark ? '#d95926' : '#eb6834', // orange
    grid: dark ? '#2c2c2a' : '#e1e0d9',
    axis: '#898781',
    ink: dark ? '#ffffff' : '#0b0b0b',
    inkMuted: dark ? '#c3c2b7' : '#52514e',
    surface: dark ? '#1a1a19' : '#fcfcfb',
    border: dark ? 'rgba(255,255,255,0.10)' : 'rgba(11,11,11,0.10)',
  }
}
