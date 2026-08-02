import { capitalize } from './labels'

export interface MetricMeta {
  label: string // display label (defaults to the raw column key)
  unit: string // display unit ('' = none)
  group: string // series sharing a group overlay on ONE chart
  groupTitle: string // that chart's title
  agg: 'avg' | 'sum' // how daily values roll up to week/month
  transform?: (v: number) => number // per-row unit conversion
}

const SCORE = { unit: 'pts', group: 'score', groupTitle: 'Scores (0–100)', agg: 'avg' } as const

// Known weather columns (Open-Meteo daily fields + derived scores). The scores
// come in two flavours: v1 (the original sheet formulas) and v2 (research-based,
// suffixed _v2) — both are 0–100 points so they share the "Scores" chart.
const WEATHER: Record<string, Omit<MetricMeta, 'label'>> = {
  temp_max: { unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg' },
  temp_min: { unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg' },
  temp_mean: { unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg' },
  apparent_temp_max: { unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg' },
  apparent_temp_min: { unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg' },
  ideal_temp: { unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg' },

  precipitation: { unit: 'mm', group: 'precip', groupTitle: 'Precipitation (mm)', agg: 'sum' },
  rain: { unit: 'mm', group: 'precip', groupTitle: 'Precipitation (mm)', agg: 'sum' },
  snowfall: { unit: 'cm', group: 'snow', groupTitle: 'Snowfall (cm)', agg: 'sum' },

  wind_max: { unit: 'km/h', group: 'wind', groupTitle: 'Wind (km/h)', agg: 'avg' },
  wind_mean: { unit: 'km/h', group: 'wind', groupTitle: 'Wind (km/h)', agg: 'avg' },

  sunshine_percentage: { unit: '%', group: 'pct', groupTitle: 'Sunshine (% of possible)', agg: 'avg' },
  weather_code: { unit: 'WMO', group: 'code', groupTitle: 'Weather code (WMO)', agg: 'avg' },

  // v1 scores (original sheet formulas)
  temp_score: { ...SCORE },
  rain_score: { ...SCORE },
  wind_score: { ...SCORE },
  snow_bonus: { ...SCORE },
  nice_day_score: { ...SCORE },
  outdoor_score: { ...SCORE },
  // v2 scores (research-based revision)
  comfort_score_v2: { ...SCORE },
  rain_score_v2: { ...SCORE },
  wind_score_v2: { ...SCORE },
  nice_day_score_v2: { ...SCORE },
  outdoor_score_v2: { ...SCORE },
  // v2 hazard multiplier (0.4–1.0, applied to the v2 scores)
  hazard_factor: { unit: '×', group: 'hazard', groupTitle: 'Hazard factor (×)', agg: 'avg' },

  year: { unit: '', group: 'calendar', groupTitle: 'Calendar values', agg: 'avg' },
  month: { unit: '', group: 'calendar', groupTitle: 'Calendar values', agg: 'avg' },
  day: { unit: '', group: 'calendar', groupTitle: 'Calendar values', agg: 'avg' },
  day_of_year: { unit: '', group: 'calendar', groupTitle: 'Calendar values', agg: 'avg' },
  week: { unit: '', group: 'calendar', groupTitle: 'Calendar values', agg: 'avg' },
}

// Commodities are trimmed to close + day-over-day % change per instrument.
const CMDTY_FIELDS = ['close', 'change_pct']

function parseCommodity(key: string): { instrument: string; field: string } | null {
  for (const f of CMDTY_FIELDS) {
    if (key.endsWith('_' + f)) return { instrument: key.slice(0, -(f.length + 1)), field: f }
  }
  return null
}

// Derive meaning + unit + chart grouping for any column key.
export function metricMeta(column: string): MetricMeta {
  const weather = WEATHER[column]
  if (weather) return { label: column, ...weather }

  // EUR/RON official reference rate + its day-over-day % change.
  if (column === 'eur_ron') {
    return { label: column, unit: 'RON', group: 'eurron', groupTitle: 'EUR/RON (RON per €)', agg: 'avg' }
  }
  if (column === 'change_pct') {
    return { label: column, unit: '%', group: 'eurron_chg', groupTitle: 'EUR/RON daily change (%)', agg: 'avg' }
  }

  // Commodities — close is instrument-specific (one chart each, scales differ);
  // change_pct is normalised %, so all instruments share one comparison chart.
  const c = parseCommodity(column)
  if (c) {
    const instr = capitalize(c.instrument)
    if (c.field === 'change_pct') {
      return { label: column, unit: '%', group: 'cmdty_chg', groupTitle: 'Commodity daily change (%)', agg: 'avg' }
    }
    return {
      label: column,
      unit: 'price', // instrument-specific (USD/oz, USD/bbl, ¢/lb…)
      group: `cmdty:${c.instrument}`,
      groupTitle: `${instr} price`,
      agg: 'avg',
    }
  }

  return { label: column, unit: '', group: `other:${column}`, groupTitle: column, agg: 'avg' }
}
