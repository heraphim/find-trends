import { capitalize } from './labels'

// How prominent a column is in the UI:
//  - primary : shown in the category dropdown by default
//  - advanced: hidden behind the dropdown's "Show advanced" toggle
//  - hidden  : never surfaced (pure derivation / internal flags)
export type Tier = 'primary' | 'advanced' | 'hidden'

export interface MetricMeta {
  label: string // display label (human-friendly, no city prefix)
  unit: string // display unit ('' = none)
  group: string // series sharing a group overlay on ONE chart
  groupTitle: string // that chart's title
  agg: 'avg' | 'sum' // how daily values roll up to week/month
  tier: Tier // UI prominence (see Tier)
  transform?: (v: number) => number // per-row unit conversion
}

const SCORE = { unit: 'pts', group: 'score', groupTitle: 'Scores (0–100)', agg: 'avg' } as const

// Known weather columns (Open-Meteo daily fields + derived scores). The scores
// come in two flavours: v1 (the original sheet formulas) and v2 (research-based,
// suffixed _v2) — both are 0–100 points so they share the "Scores" chart. v2 is
// the recommended set, so v2 scores are primary and v1 are demoted to advanced.
const WEATHER: Record<string, MetricMeta> = {
  temp_max: { label: 'Max temperature', unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg', tier: 'primary' },
  temp_min: { label: 'Min temperature', unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg', tier: 'primary' },
  temp_mean: { label: 'Mean temperature', unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg', tier: 'primary' },
  apparent_temp_max: { label: 'Feels-like max', unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg', tier: 'advanced' },
  apparent_temp_min: { label: 'Feels-like min', unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg', tier: 'advanced' },
  // Internal helper: constant 0 in the data, only used to derive temp_score.
  ideal_temp: { label: 'Ideal temperature', unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg', tier: 'hidden' },

  precipitation: { label: 'Precipitation', unit: 'mm', group: 'precip', groupTitle: 'Precipitation (mm)', agg: 'sum', tier: 'primary' },
  rain: { label: 'Rain (excl. snow)', unit: 'mm', group: 'precip', groupTitle: 'Precipitation (mm)', agg: 'sum', tier: 'advanced' },
  snowfall: { label: 'Snowfall', unit: 'cm', group: 'snow', groupTitle: 'Snowfall (cm)', agg: 'sum', tier: 'primary' },

  wind_max: { label: 'Max wind', unit: 'km/h', group: 'wind', groupTitle: 'Wind (km/h)', agg: 'avg', tier: 'primary' },
  wind_mean: { label: 'Mean wind', unit: 'km/h', group: 'wind', groupTitle: 'Wind (km/h)', agg: 'avg', tier: 'advanced' },

  sunshine_percentage: { label: 'Sunshine', unit: '%', group: 'pct', groupTitle: 'Sunshine (% of possible)', agg: 'avg', tier: 'primary' },

  // v1 scores (original sheet formulas)
  temp_score: { ...SCORE, label: 'Temperature score (v1)', tier: 'advanced' },
  rain_score: { ...SCORE, label: 'Rain score (v1)', tier: 'advanced' },
  wind_score: { ...SCORE, label: 'Wind score (v1)', tier: 'advanced' },
  snow_bonus: { ...SCORE, label: 'Snow bonus (v1)', tier: 'hidden' },
  nice_day_score: { ...SCORE, label: 'Nice-day score (v1)', tier: 'advanced' },
  outdoor_score: { ...SCORE, label: 'Outdoor score (v1)', tier: 'advanced' },
  // v2 scores (research-based revision)
  comfort_score_v2: { ...SCORE, label: 'Comfort score', tier: 'primary' },
  rain_score_v2: { ...SCORE, label: 'Rain score', tier: 'advanced' },
  wind_score_v2: { ...SCORE, label: 'Wind score', tier: 'advanced' },
  nice_day_score_v2: { ...SCORE, label: 'Nice-day score', tier: 'primary' },
  outdoor_score_v2: { ...SCORE, label: 'Outdoor score', tier: 'primary' },
  // v2 hazard multiplier (0.4–1.0, applied to the v2 scores)
  hazard_factor: { label: 'Hazard factor', unit: '×', group: 'hazard', groupTitle: 'Hazard factor (×)', agg: 'avg', tier: 'advanced' },
}

// Event / day-classifier columns (non-numeric, or force-classified as events).
// These never plot as a line, so they only carry a display label + tier.
const EVENTS: Record<string, { label: string; tier: Tier }> = {
  weather_code: { label: 'Weather condition (WMO)', tier: 'advanced' },
  is_forecast: { label: 'Forecast day', tier: 'hidden' },
  nice_day_label: { label: 'Nice-day label (v1)', tier: 'advanced' },
  heavy_rain: { label: 'Heavy-rain day', tier: 'advanced' },
  sunny_day: { label: 'Sunny day', tier: 'advanced' },
  nice_day_label_v2: { label: 'Nice-day label', tier: 'primary' },
  big_move: { label: 'Big FX move', tier: 'advanced' },
}

// Friendlier commodity display names (keyed by the instrument in `<name>_close`).
const COMMODITY_LABEL: Record<string, string> = {
  Brent: 'Brent crude',
  EuroGas: 'European gas (TTF)',
  Wheat: 'Wheat',
  Corn: 'Corn',
  Gold: 'Gold',
  Copper: 'Copper',
}

// Commodities are trimmed to close + day-over-day % change per instrument.
const CMDTY_FIELDS = ['close', 'change_pct']

function parseCommodity(key: string): { instrument: string; field: string } | null {
  for (const f of CMDTY_FIELDS) {
    if (key.endsWith('_' + f)) return { instrument: key.slice(0, -(f.length + 1)), field: f }
  }
  return null
}

// Dev-only nudge: any column with no registry entry falls back to advanced/raw —
// warn once so new getting-data columns get a proper label + tier added here.
const warned = new Set<string>()
function warnUnregistered(column: string): void {
  if (import.meta.env.DEV && !warned.has(column)) {
    warned.add(column)
    console.warn(
      `[metricMeta] no registry entry for "${column}" — defaulting to advanced + raw label. ` +
        `Add it to src/lib/metricMeta.ts (see the "Column display registry" rule in CLAUDE.md).`,
    )
  }
}

// Derive meaning + unit + chart grouping for any metric column key.
export function metricMeta(column: string): MetricMeta {
  const weather = WEATHER[column]
  if (weather) return weather

  // EUR/RON official reference rate + its day-over-day % change.
  if (column === 'eur_ron') {
    return { label: 'EUR/RON rate', unit: 'RON', group: 'eurron', groupTitle: 'EUR/RON (RON per €)', agg: 'avg', tier: 'primary' }
  }
  if (column === 'change_pct') {
    return { label: 'EUR/RON daily change', unit: '%', group: 'eurron_chg', groupTitle: 'EUR/RON daily change (%)', agg: 'avg', tier: 'advanced' }
  }

  // Commodities — close is instrument-specific (one chart each, scales differ);
  // change_pct is normalised %, so all instruments share one comparison chart.
  const c = parseCommodity(column)
  if (c) {
    const instr = capitalize(c.instrument)
    const name = COMMODITY_LABEL[c.instrument] ?? instr
    if (c.field === 'change_pct') {
      return { label: `${name} daily change`, unit: '%', group: 'cmdty_chg', groupTitle: 'Commodity daily change (%)', agg: 'avg', tier: 'advanced' }
    }
    return {
      label: name,
      unit: 'price', // instrument-specific (USD/oz, USD/bbl, ¢/lb…)
      group: `cmdty:${c.instrument}`,
      groupTitle: `${instr} price`,
      agg: 'avg',
      tier: 'primary',
    }
  }

  warnUnregistered(column)
  return { label: column, unit: '', group: `other:${column}`, groupTitle: column, agg: 'avg', tier: 'advanced' }
}

// Display label + tier for ANY column, metric or event. Used by the UI to label
// checkboxes/series and to decide show/hide (primary vs advanced vs hidden).
export function columnMeta(column: string): { label: string; tier: Tier } {
  const ev = EVENTS[column]
  if (ev) return ev
  const m = metricMeta(column)
  return { label: m.label, tier: m.tier }
}
