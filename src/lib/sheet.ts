import Papa from 'papaparse'
import { classifyColumns, parseSheetDate, type DataRow, type SheetData } from './data'

// Public Google Sheet with the workbook of daily data.
export const SHEET_ID = '1EalVOfYpeJ0HQPUkeJClQ3M8rtlskBFmMTivvbUVR7Y'

// The column holding the row date, in DD-MM-YY form.
const DATE_COLUMN = 'date'

// gviz CSV export for one named tab — works client-side, no API key, as long as
// the sheet is shared "anyone with the link can view".
export function csvUrlForSheet(sheetName: string): string {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    sheetName,
  )}`
}

// Fetch and parse one tab into typed rows + classified columns.
export async function fetchSheetData(sheetName: string): Promise<SheetData> {
  const res = await fetch(csvUrlForSheet(sheetName))
  if (!res.ok) {
    throw new Error(
      `Could not read "${sheetName}" (HTTP ${res.status}). Make sure the sheet is shared for viewing.`,
    )
  }
  const text = await res.text()
  return parseSheetData(text)
}

// Shared parser used for the sheet tabs (and, later, uploaded CSV files).
export function parseSheetData(text: string): SheetData {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })
  const records = parsed.data
  const columns = classifyColumns(records, DATE_COLUMN)
  const metricKeys = new Set(columns.filter((c) => c.kind === 'metric').map((c) => c.key))

  const rows: DataRow[] = []
  for (const record of records) {
    const date = parseSheetDate(record[DATE_COLUMN])
    if (!date) continue
    const values: Record<string, number> = {}
    for (const key of metricKeys) {
      const raw = record[key]
      const num = Number(raw)
      if (raw !== '' && raw != null && !Number.isNaN(num)) values[key] = num
    }
    rows.push({ date, values })
  }
  rows.sort((a, b) => a.date.getTime() - b.date.getTime())

  return { rows, columns }
}
