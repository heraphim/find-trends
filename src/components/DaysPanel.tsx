import { useRef } from 'react'
import {
  ALL_MONTHS,
  ALL_WEEKDAYS,
  type DaysPanelState,
} from '../lib/daysPanel'

interface Props {
  state: DaysPanelState
  onChange: (next: DaysPanelState) => void
}

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// One panel row: a checkbox that opens its sub-control underneath.
function Row({
  label,
  on,
  onToggle,
  children,
}: {
  label: string
  on: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={on} onChange={onToggle} className="h-3.5 w-3.5 accent-blue-600" />
        {label}
      </label>
      {on && <div className="mt-1.5 pl-6">{children}</div>}
    </div>
  )
}

function Pill({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <label
      className={
        'flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors ' +
        (checked
          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-300'
          : 'border-slate-300 text-slate-400 line-through dark:border-slate-700 dark:text-slate-500')
      }
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="h-3 w-3 accent-blue-600" />
      {label}
    </label>
  )
}

// Day-of-month picker: a circle of the 31 day slots with two draggable handles;
// the clockwise arc from `lo` to `hi` (inclusive, wrapping past 31 → 1) is the
// kept range, so a salary period like 25..5 is a single arc.
const SLIDER_SIZE = 150
const SLIDER_R = 58
const CX = SLIDER_SIZE / 2
const CY = SLIDER_SIZE / 2
const STEP = (2 * Math.PI) / 31

function dayAngle(d: number): number {
  return (d - 1) * STEP - Math.PI / 2
}

function dayPoint(d: number): { x: number; y: number } {
  return { x: CX + SLIDER_R * Math.cos(dayAngle(d)), y: CY + SLIDER_R * Math.sin(dayAngle(d)) }
}

function CircularDaySlider({
  lo,
  hi,
  onChange,
}: {
  lo: number
  hi: number
  onChange: (lo: number, hi: number) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<'lo' | 'hi' | null>(null)

  const dayFromPointer = (e: React.PointerEvent): number => {
    const rect = svgRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left - CX
    const y = e.clientY - rect.top - CY
    const theta = (Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)
    return (Math.round(theta / STEP) % 31) + 1
  }

  const startDrag = (which: 'lo' | 'hi') => (e: React.PointerEvent) => {
    dragging.current = which
    svgRef.current?.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const move = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const d = dayFromPointer(e)
    if (dragging.current === 'lo') onChange(d, hi)
    else onChange(lo, d)
  }

  const endDrag = () => {
    dragging.current = null
  }

  const sweep = ((hi - lo + 31) % 31) * (360 / 31)
  const nDays = ((hi - lo + 31) % 31) + 1
  const p1 = dayPoint(lo)
  const p2 = dayPoint(hi)

  return (
    <svg
      ref={svgRef}
      width={SLIDER_SIZE}
      height={SLIDER_SIZE}
      className="touch-none select-none"
      onPointerMove={move}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <circle cx={CX} cy={CY} r={SLIDER_R} fill="none" strokeWidth={10} className="stroke-slate-200 dark:stroke-slate-700" />
      {lo === hi ? null : (
        <path
          d={`M ${p1.x} ${p1.y} A ${SLIDER_R} ${SLIDER_R} 0 ${sweep > 180 ? 1 : 0} 1 ${p2.x} ${p2.y}`}
          fill="none"
          strokeWidth={10}
          strokeLinecap="round"
          className="stroke-blue-500"
        />
      )}
      {([1, 6, 11, 16, 21, 26] as const).map((d) => {
        const a = dayAngle(d)
        const tx = CX + (SLIDER_R - 16) * Math.cos(a)
        const ty = CY + (SLIDER_R - 16) * Math.sin(a)
        return (
          <text
            key={d}
            x={tx}
            y={ty}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-slate-400 text-[9px] dark:fill-slate-500"
          >
            {d}
          </text>
        )
      })}
      <text x={CX} y={CY - 6} textAnchor="middle" className="fill-slate-700 text-sm font-semibold dark:fill-slate-200">
        {lo === hi ? `${lo}` : `${lo} – ${hi}`}
      </text>
      <text x={CX} y={CY + 10} textAnchor="middle" className="fill-slate-400 text-[10px]">
        {nDays === 31 ? 'all days' : `${nDays} day${nDays === 1 ? '' : 's'}`}
      </text>
      {(['lo', 'hi'] as const).map((which) => {
        const p = which === 'lo' ? p1 : p2
        return (
          <circle
            key={which}
            cx={p.x}
            cy={p.y}
            r={8}
            strokeWidth={2.5}
            className="cursor-grab fill-white stroke-blue-600 dark:fill-slate-900"
            onPointerDown={startDrag(which)}
          />
        )
      })}
    </svg>
  )
}

// The Days panel: one row per kept days-sheet column. Checking a row opens its
// control with everything selected (no filtering); unchecking resets the row.
export function DaysPanel({ state, onChange }: Props) {
  const toggleRow = (key: keyof DaysPanelState) => {
    const fresh: DaysPanelState = {
      holiday: { on: false, yes: true, no: true },
      weekday: { on: false, days: [...ALL_WEEKDAYS] },
      month: { on: false, months: [...ALL_MONTHS] },
      day: { on: false, lo: 1, hi: 31 },
    }
    onChange({ ...state, [key]: { ...fresh[key], on: !state[key].on } })
  }

  const toggleIn = (list: number[], v: number): number[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v].sort((a, b) => a - b)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Days</span>
      <div className="mt-2 flex flex-col gap-2.5">
        <Row label="Public holiday" on={state.holiday.on} onToggle={() => toggleRow('holiday')}>
          <div className="flex flex-wrap gap-1">
            <Pill
              label="Is holiday"
              checked={state.holiday.yes}
              onToggle={() => onChange({ ...state, holiday: { ...state.holiday, yes: !state.holiday.yes } })}
            />
            <Pill
              label="Is not holiday"
              checked={state.holiday.no}
              onToggle={() => onChange({ ...state, holiday: { ...state.holiday, no: !state.holiday.no } })}
            />
          </div>
        </Row>

        <Row label="Day of week" on={state.weekday.on} onToggle={() => toggleRow('weekday')}>
          <div className="flex flex-wrap gap-1">
            {WEEKDAY_LABELS.map((l, i) => (
              <Pill
                key={l}
                label={l}
                checked={state.weekday.days.includes(i)}
                onToggle={() =>
                  onChange({ ...state, weekday: { ...state.weekday, days: toggleIn(state.weekday.days, i) } })
                }
              />
            ))}
          </div>
        </Row>

        <Row label="Month" on={state.month.on} onToggle={() => toggleRow('month')}>
          <div className="flex flex-wrap gap-1">
            {MONTH_LABELS.map((l, i) => (
              <Pill
                key={l}
                label={l}
                checked={state.month.months.includes(i)}
                onToggle={() =>
                  onChange({ ...state, month: { ...state.month, months: toggleIn(state.month.months, i) } })
                }
              />
            ))}
          </div>
        </Row>

        <Row label="Day of month" on={state.day.on} onToggle={() => toggleRow('day')}>
          <CircularDaySlider
            lo={state.day.lo}
            hi={state.day.hi}
            onChange={(lo, hi) => onChange({ ...state, day: { ...state.day, lo, hi } })}
          />
        </Row>
      </div>
    </div>
  )
}
