import Papa from 'papaparse'
import { parseSheetDate, type DataRow } from './data'

// Public Google Sheet with daily weather data.
export const SHEET_ID = '1EalVOfYpeJ0HQPUkeJClQ3M8rtlskBFmMTivvbUVR7Y'

// gviz CSV export — works client-side with no API key as long as the sheet is
// shared "anyone with the link can view" (or published to the web).
export const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`

// The column holding the row date, in DD-MM-YY form.
const DATE_COLUMN = 'date'

// Fetch and parse the sheet into typed rows sorted by date ascending.
export async function fetchSheetRows(): Promise<DataRow[]> {
  const res = await fetch(SHEET_CSV_URL)
  if (!res.ok) {
    throw new Error(
      `Could not read the sheet (HTTP ${res.status}). Make sure it is shared so "anyone with the link can view".`,
    )
  }
  const text = await res.text()
  return parseCsv(text, DATE_COLUMN)
}

// Shared parser used for both the sheet and uploaded CSV files.
export function parseCsv(text: string, dateColumn: string): DataRow[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  const rows: DataRow[] = []
  for (const record of parsed.data) {
    const date = parseSheetDate(record[dateColumn])
    if (!date) continue

    const values: Record<string, number> = {}
    for (const [key, raw] of Object.entries(record)) {
      if (key === dateColumn) continue
      const num = Number(raw)
      if (raw !== '' && !Number.isNaN(num)) values[key] = num
    }
    rows.push({ date, values })
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime())
  return rows
}
