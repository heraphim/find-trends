import { useRef, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTheme } from '../hooks/useTheme'
import { chartColors } from '../lib/chartColors'
import type { ChartRow, SeriesSpec } from '../lib/data'
import type { Tier } from '../lib/events'

export interface EventMarker {
  startLabel: string // bucket label of the event's start (must match an x-axis label)
  endLabel: string // bucket label of the event's end; === startLabel for single-bucket events
  tier: Tier
  names: string[]
}

// One curated event with its bucket span (epochs), for the hover tooltip.
export interface BucketEvent {
  startT: number
  endT: number
  name: string
  tier: Tier
}

const TIER_COLOR: Record<Tier, string> = {
  major: '#dc2626',
  notable: '#d97706',
  minor: '#94a3b8',
}

interface Props {
  data: ChartRow[]
  series: SeriesSpec[]
  colorById: Record<string, string>
  percent?: boolean
  onPointClick?: (bucketT: number) => void
  eventMarkers?: EventMarker[]
  bucketEvents?: BucketEvent[]
  onZoom?: (startT: number, endT: number) => void
}

// Read the hovered/active data index out of a recharts mouse-event state.
// Recharts exposes the active point differently across handlers/versions, so try
// the index props first, then fall back to matching the active x-axis label.
function activeIndexOf(state: unknown, data: ChartRow[]): number | null {
  const s = state as {
    activeTooltipIndex?: number | string
    activeIndex?: number | string
    activeLabel?: string
  }
  const i = Number(s?.activeTooltipIndex ?? s?.activeIndex)
  if (Number.isInteger(i) && i >= 0 && i < data.length) return i
  if (s?.activeLabel != null) {
    const j = data.findIndex((r) => r.label === s.activeLabel)
    if (j >= 0) return j
  }
  return null
}

// A dot + native hover tooltip at the top of an event's reference line.
function MarkerLabel(props: { viewBox?: { x?: number; y?: number }; color: string; names: string[] }) {
  const x = props.viewBox?.x ?? 0
  const y = props.viewBox?.y ?? 0
  return (
    <g>
      <title>{props.names.join('\n')}</title>
      <circle cx={x} cy={y + 4} r={3.5} fill={props.color} stroke="white" strokeWidth={1} />
    </g>
  )
}

interface TooltipInjectedProps {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number; color: string }>
}

function fmtValue(v: number, unit: string): string {
  const n = v.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (!unit || unit === 'price') return n
  return `${n} ${unit}`
}

function fmtPercent(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

function ChartTooltip({
  active,
  payload,
  series,
  colors,
  percent,
  bucketEvents,
}: TooltipInjectedProps & {
  series: SeriesSpec[]
  colors: ReturnType<typeof chartColors>
  percent?: boolean
  bucketEvents?: BucketEvent[]
}) {
  if (!active || !payload?.length) return null
  const row = (payload[0] as unknown as { payload: ChartRow }).payload
  const full = row.full
  const days = row._days as number | undefined
  const rowT = row.t as number
  const labelById = new Map(series.map((s) => [s.id, s.label]))
  const unitById = new Map(series.map((s) => [s.id, s.unit]))
  // Curated events whose bucket span covers the hovered bucket.
  const events = (bucketEvents ?? []).filter((e) => e.startT <= rowT && rowT <= e.endT)
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{ background: colors.surface, borderColor: colors.border, color: colors.ink }}
    >
      <div className="mb-1 font-medium">
        {full}
        {days !== undefined && (
          <span style={{ color: colors.inkMuted }} className="ml-1 font-normal">
            · {days} day{days === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: p.color }}
            />
            <span style={{ color: colors.inkMuted }}>{labelById.get(p.dataKey) ?? p.dataKey}</span>
            <span className="ml-auto font-semibold tabular-nums">
              {percent ? fmtPercent(p.value) : fmtValue(p.value, unitById.get(p.dataKey) ?? '')}
            </span>
          </div>
        ))}
      </div>
      {events.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-0.5 border-t pt-1.5" style={{ borderColor: colors.border }}>
          {events.slice(0, 6).map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: TIER_COLOR[e.tier] }} />
              <span style={{ color: colors.inkMuted }}>{e.name}</span>
            </div>
          ))}
          {events.length > 6 && (
            <span style={{ color: colors.inkMuted }}>+{events.length - 6} more</span>
          )}
        </div>
      )}
    </div>
  )
}

export function MultiTrendChart({
  data,
  series,
  colorById,
  percent,
  onPointClick,
  eventMarkers,
  bucketEvents,
  onZoom,
}: Props) {
  const { theme } = useTheme()
  const colors = chartColors(theme)
  const labelById = new Map(series.map((s) => [s.id, s.label]))
  // With few points, draw dots so single/sparse days are visible.
  const showDots = data.length <= 40

  // Drag-to-zoom: track the selected index span; commit on release.
  const [drag, setDrag] = useState<{ startIdx: number; endIdx: number } | null>(null)
  const draggedRef = useRef(false) // suppress the click that ends a drag

  const finishDrag = () => {
    if (drag && drag.startIdx !== drag.endIdx && onZoom) {
      const a = data[Math.min(drag.startIdx, drag.endIdx)]?.t
      const b = data[Math.max(drag.startIdx, drag.endIdx)]?.t
      if (typeof a === 'number' && typeof b === 'number') {
        draggedRef.current = true
        onZoom(a, b)
      }
    }
    setDrag(null)
  }

  const canZoom = !!onZoom && data.length > 1
  const dragging = drag !== null && drag.startIdx !== drag.endIdx

  return (
    <div
      className={
        'h-96 w-full' + (canZoom ? ' cursor-crosshair select-none' : onPointClick ? ' cursor-pointer' : '')
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          onMouseDown={(state: unknown) => {
            if (!canZoom) return
            const idx = activeIndexOf(state, data)
            if (idx !== null) setDrag({ startIdx: idx, endIdx: idx })
          }}
          onMouseMove={(state: unknown) => {
            if (!drag) return
            const idx = activeIndexOf(state, data)
            if (idx !== null && idx !== drag.endIdx) setDrag({ ...drag, endIdx: idx })
          }}
          onMouseUp={finishDrag}
          onMouseLeave={() => setDrag(null)}
          onClick={(state: unknown) => {
            if (draggedRef.current) {
              draggedRef.current = false
              return // this "click" was the end of a drag; don't focus a point
            }
            const idx = activeIndexOf(state, data)
            if (idx !== null) {
              const t = data[idx].t
              if (typeof t === 'number') onPointClick?.(t)
            }
          }}
        >
          <CartesianGrid stroke={colors.grid} vertical={false} />
          {dragging && drag && (
            <ReferenceArea
              x1={data[Math.min(drag.startIdx, drag.endIdx)].label}
              x2={data[Math.max(drag.startIdx, drag.endIdx)].label}
              fill={colors.axis}
              fillOpacity={0.15}
              strokeOpacity={0}
            />
          )}
          {eventMarkers?.map((m) =>
            m.startLabel === m.endLabel ? (
              <ReferenceLine
                key={`${m.startLabel}|${m.endLabel}`}
                x={m.startLabel}
                stroke={TIER_COLOR[m.tier]}
                strokeDasharray="3 3"
                strokeOpacity={0.7}
                label={<MarkerLabel color={TIER_COLOR[m.tier]} names={m.names} />}
              />
            ) : (
              <ReferenceArea
                key={`${m.startLabel}|${m.endLabel}`}
                x1={m.startLabel}
                x2={m.endLabel}
                fill={TIER_COLOR[m.tier]}
                fillOpacity={0.12}
                stroke={TIER_COLOR[m.tier]}
                strokeOpacity={0.35}
                label={<MarkerLabel color={TIER_COLOR[m.tier]} names={m.names} />}
              />
            ),
          )}
          <XAxis
            dataKey="label"
            tick={{ fill: colors.axis, fontSize: 12 }}
            tickMargin={8}
            minTickGap={44}
            axisLine={{ stroke: colors.grid }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: colors.axis, fontSize: 12 }}
            tickMargin={8}
            width={56}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) =>
              percent
                ? `${v > 0 ? '+' : ''}${v}%`
                : v.toLocaleString(undefined, { maximumFractionDigits: 1 })
            }
          />
          <Tooltip
            cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
            content={<ChartTooltip series={series} colors={colors} percent={percent} bucketEvents={bucketEvents} />}
          />
          <Legend
            formatter={(value: string) => (
              <span style={{ color: colors.inkMuted, fontSize: 12 }}>
                {labelById.get(value) ?? value}
              </span>
            )}
          />
          {series.map((s) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.id}
              stroke={colorById[s.id] ?? colors.categorical[0]}
              strokeWidth={2}
              dot={showDots ? { r: 2.5, strokeWidth: 0 } : false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
