import { capitalize } from './labels'

export interface MetricMeta {
  label: string // display label (defaults to the raw column key)
  unit: string // display unit ('' = none)
  group: string // series sharing a group overlay on ONE chart
  groupTitle: string // that chart's title
  agg: 'avg' | 'sum' // how daily values roll up to week/month
  transform?: (v: number) => number // per-row unit conversion
}

const SECONDS_TO_HOURS = (v: number) => v / 3600

// Known weather columns (Open-Meteo daily fields + derived scores).
const WEATHER: Record<string, Omit<MetricMeta, 'label'>> = {
  temp_max: { unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg' },
  temp_min: { unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg' },
  temp_mean: { unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg' },
  apparent_temp_max: { unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg' },
  apparent_temp_min: { unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg' },
  apparent_temp_mean: { unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg' },
  ideal_temp: { unit: '°C', group: 'temp', groupTitle: 'Temperature (°C)', agg: 'avg' },

  precipitation: { unit: 'mm', group: 'precip', groupTitle: 'Precipitation (mm)', agg: 'sum' },
  rain: { unit: 'mm', group: 'precip', groupTitle: 'Precipitation (mm)', agg: 'sum' },
  snowfall: { unit: 'cm', group: 'snow', groupTitle: 'Snowfall (cm)', agg: 'sum' },

  wind_max: { unit: 'km/h', group: 'wind', groupTitle: 'Max wind (km/h)', agg: 'avg' },

  sunshine_duration: {
    unit: 'h',
    group: 'duration',
    groupTitle: 'Duration (hours)',
    agg: 'avg',
    transform: SECONDS_TO_HOURS,
  },
  daylight_duration: {
    unit: 'h',
    group: 'duration',
    groupTitle: 'Duration (hours)',
    agg: 'avg',
    transform: SECONDS_TO_HOURS,
  },
  sunshine_hours: { unit: 'h', group: 'duration', groupTitle: 'Duration (hours)', agg: 'avg' },

  solar_radiation: {
    unit: 'MJ/m²',
    group: 'solar',
    groupTitle: 'Solar radiation (MJ/m²)',
    agg: 'avg',
  },
  weather_code: { unit: 'WMO', group: 'code', groupTitle: 'Weather code (WMO)', agg: 'avg' },

  temp_score: { unit: 'pts', group: 'score', groupTitle: 'Scores (0–100)', agg: 'avg' },
  rain_score: { unit: 'pts', group: 'score', groupTitle: 'Scores (0–100)', agg: 'avg' },
  wind_score: { unit: 'pts', group: 'score', groupTitle: 'Scores (0–100)', agg: 'avg' },
  nice_day_score: { unit: 'pts', group: 'score', groupTitle: 'Scores (0–100)', agg: 'avg' },
  snow_bonus: { unit: 'pts', group: 'score', groupTitle: 'Scores (0–100)', agg: 'avg' },
  sunshine_percentage: { unit: '%', group: 'pct', groupTitle: 'Sunshine (% of possible)', agg: 'avg' },

  year: { unit: '', group: 'calendar', groupTitle: 'Calendar values', agg: 'avg' },
  month: { unit: '', group: 'calendar', groupTitle: 'Calendar values', agg: 'avg' },
  day: { unit: '', group: 'calendar', groupTitle: 'Calendar values', agg: 'avg' },
  day_of_year: { unit: '', group: 'calendar', groupTitle: 'Calendar values', agg: 'avg' },
  week: { unit: '', group: 'calendar', groupTitle: 'Calendar values', agg: 'avg' },
}

const CMDTY_FIELDS = ['adj_close', 'open', 'high', 'low', 'close', 'volume']

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

  // EUR/RON exchange rate (RON per euro) + its (empty) volume.
  if (column.startsWith('eurron_')) {
    if (column === 'eurron_volume') {
      return { label: column, unit: '', group: 'eurron_vol', groupTitle: 'EUR/RON volume', agg: 'sum' }
    }
    return { label: column, unit: 'RON', group: 'eurron', groupTitle: 'EUR/RON (RON per €)', agg: 'avg' }
  }

  // Commodity OHLCV — one chart per instrument (scales differ hugely).
  const c = parseCommodity(column)
  if (c) {
    const instr = capitalize(c.instrument)
    if (c.field === 'volume') {
      return {
        label: column,
        unit: 'contracts',
        group: `cmdty:${c.instrument}:vol`,
        groupTitle: `${instr} volume`,
        agg: 'sum',
      }
    }
    return {
      label: column,
      unit: 'price', // instrument-specific (USD/oz, USD/bbl, ¢/lb…) — see notes
      group: `cmdty:${c.instrument}`,
      groupTitle: `${instr} price`,
      agg: 'avg',
    }
  }

  return { label: column, unit: '', group: `other:${column}`, groupTitle: column, agg: 'avg' }
}
