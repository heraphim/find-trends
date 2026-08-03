import { useRef, useState } from 'react'
import { capitalize } from '../lib/labels'
import {
  SALES_METRICS,
  SALES_METRIC_LABEL,
  datasetSpan,
  salesSelKey,
  type SalesDataset,
} from '../lib/sales'
import { useCollapsed } from '../hooks/useCollapsed'
import { CollapseChevron } from './CollapseChevron'

interface Props {
  datasets: SalesDataset[]
  selections: Set<string> // `${dsId}::${metric}`
  includedCities: Set<string> // a dataset only plots if its city is selected
  onUpload: (file: File) => Promise<void> // parse + add (throws with a message)
  onToggle: (dsId: string, metric: (typeof SALES_METRICS)[number]) => void
  onRemove: (dsId: string) => void
}

// Why a dataset's series are hidden from the chart/stats, if they are.
function hiddenReason(ds: SalesDataset, includedCities: Set<string>): string | null {
  if (!ds.city) return 'no city in filename'
  if (!includedCities.has(ds.city)) return 'city not selected'
  return null
}

const spanFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function spanLabel(ds: SalesDataset): string {
  const s = datasetSpan(ds)
  if (!s) return ''
  return `${spanFmt.format(s.start)} – ${spanFmt.format(s.end)}`
}

export function SalesPanel({ datasets, selections, includedCities, onUpload, onToggle, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, toggle] = useCollapsed('sales')

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(files)) await onUpload(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = '' // allow re-uploading the same file
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CollapseChevron collapsed={collapsed} onClick={toggle} label="Sales" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sales</span>

        {collapsed ? (
          <span className="text-xs text-slate-400">
            {datasets.length === 0
              ? 'No datasets'
              : `${datasets.length} dataset${datasets.length === 1 ? '' : 's'}`}
          </span>
        ) : (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".xls,.xlsx,.xlsm,.csv"
              multiple
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
            >
              {busy ? 'Reading…' : '↑ Upload sales'}
            </button>

            {datasets.length === 0 && !error && (
              <span className="text-xs text-slate-400">
                Upload your shop's .xls — date in column G, amount in column I (from row 4). Name it
                “City - …” to tie it to that city's weather.
              </span>
            )}
            {error && <span className="text-xs text-red-500">{error}</span>}
          </>
        )}
      </div>

      {!collapsed && datasets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {datasets.map((ds) => (
            <div
              key={ds.id}
              className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {ds.city ? capitalize(ds.city) : ds.name}
                </span>
                <span className="text-[11px] tabular-nums text-slate-400">
                  {ds.tx.length.toLocaleString()} sales · {spanLabel(ds)}
                </span>
                {hiddenReason(ds, includedCities) && (
                  <span
                    className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    title="This dataset won't plot until its city is selected in the Cities row."
                  >
                    hidden · {hiddenReason(ds, includedCities)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(ds.id)}
                  title="Remove this dataset"
                  className="ml-1 text-slate-400 hover:text-red-500"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {SALES_METRICS.map((m) => {
                  const checked = selections.has(salesSelKey(ds.id, m))
                  return (
                    <label
                      key={m}
                      className={
                        'flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors ' +
                        (checked
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-300'
                          : 'border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400')
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(ds.id, m)}
                        className="h-3 w-3 accent-blue-600"
                      />
                      {SALES_METRIC_LABEL[m]}
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
