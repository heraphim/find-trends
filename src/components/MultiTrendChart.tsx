import { useRef, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Customized,
  Legend,
  Line,
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
  series: SeriesSpec[] // line series (weather / markets)
  barSeries?: SeriesSpec[] // sales series, drawn as bars anchored to the bottom
  colorById: Record<string, string>
  percent?: boolean
  onPointClick?: (bucketT: number) => void
  eventMarkers?: EventMarker[]
  bucketEvents?: BucketEvent[]
  onZoom?: (startT: number, endT: number) => void
  hoveredMarkerKey?: string | null // event-legend hover → glow that marker
}

// A marker's stable key (must match the event legend's key).
function markerKey(m: EventMarker): string {
  return `${m.startLabel}|${m.endLabel}`
}

// Recharts injects these into a <Customized> child (band/point scale + plot rect).
interface CustomizedProps {
  xAxisMap?: Record<string, { scale?: unknown }>
  offset?: { top?: number; left?: number; width?: number; height?: number }
}
type BandScale = ((v: string) => number | undefined) & {
  domain?: () => string[]
  bandwidth?: () => number
}

// Short vertical notches at the TOP and BOTTOM edges marking each time-unit
// boundary. Unlike the full-height gridlines (suppressed when dense), these stay
// on at any density — thinned when boundaries would overlap — so the day/week/
// month/year limits are always readable. Drawn via <Customized> so we can read
// the category scale and plot rectangle straight from Recharts.
const NOTCH = 6 // px
function makeUnitTicks(tickColor: string) {
  return function UnitTicks(props: CustomizedProps) {
    const { xAxisMap, offset } = props
    if (!xAxisMap || !offset) return null
    const axis = xAxisMap[Object.keys(xAxisMap)[0]]
    const scale = axis?.scale as BandScale | undefined
    if (!scale || typeof scale !== 'function' || !scale.domain) return null
    const labels = scale.domain()
    if (labels.length === 0) return null
    const band = scale.bandwidth ? scale.bandwidth() : 0

    // Unit boundaries in px: band scale → band edges; point scale → midpoints.
    let edges: number[]
    if (band > 0) {
      edges = labels.map((l) => scale(l) ?? 0)
      edges.push((scale(labels[labels.length - 1]) ?? 0) + band)
    } else {
      const c = labels.map((l) => scale(l) ?? 0).sort((a, b) => a - b)
      const g0 = c.length > 1 ? c[1] - c[0] : 40
      const gN = c.length > 1 ? c[c.length - 1] - c[c.length - 2] : 40
      edges = [c[0] - g0 / 2, ...c.slice(1).map((x, i) => (c[i] + x) / 2), c[c.length - 1] + gN / 2]
    }

    const top = offset.top ?? 0
    const h = offset.height ?? 0
    const w = offset.width ?? 0
    const spacing = edges.length > 1 ? w / (edges.length - 1) : w
    const step = spacing > 0 && spacing < 6 ? Math.ceil(6 / spacing) : 1

    return (
      <g pointerEvents="none">
        {edges.map((x, i) =>
          i % step === 0 || i === edges.length - 1 ? (
            <g key={i}>
              <line x1={x} x2={x} y1={top} y2={top + NOTCH} stroke={tickColor} strokeWidth={1} strokeOpacity={0.7} />
              <line x1={x} x2={x} y1={top + h - NOTCH} y2={top + h} stroke={tickColor} strokeWidth={1} strokeOpacity={0.7} />
            </g>
          ) : null,
        )}
      </g>
    )
  }
}

// Sales bars sit in the lower band of the plot: give them a dedicated (hidden)
// axis whose top is padded well above the data so the tallest bar reaches only
// ~1/3 of the height, leaving the upper area for the trend lines.
function salesDomain(data: ChartRow[], barIds: string[]): [number, number] {
  let min = 0
  let max = 0
  for (const r of data) {
    for (const id of barIds) {
      const v = r[id]
      if (typeof v === 'number') {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
  }
  if (min === 0 && max === 0) return [0, 1]
  return [min, max + (max - min) * 2]
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
  lineIds,
  colors,
  percent,
  bucketEvents,
}: TooltipInjectedProps & {
  series: SeriesSpec[] // all series (lines + bars) for label/unit lookup
  lineIds: Set<string> // which ids are % when the % scale is on
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
              {percent && lineIds.has(p.dataKey)
                ? fmtPercent(p.value)
                : fmtValue(p.value, unitById.get(p.dataKey) ?? '')}
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
  barSeries,
  colorById,
  percent,
  onPointClick,
  eventMarkers,
  bucketEvents,
  onZoom,
  hoveredMarkerKey,
}: Props) {
  const { theme } = useTheme()
  const colors = chartColors(theme)
  const bars = barSeries ?? []
  const allSeries = [...series, ...bars]
  const lineIds = new Set(series.map((s) => s.id))
  const barIds = bars.map((s) => s.id)
  const labelById = new Map(allSeries.map((s) => [s.id, s.label]))
  const barDomain = salesDomain(data, barIds)
  // No line/bar series (e.g. an events-only chart): the main y-axis has nothing
  // to scale, so pin it to a dummy domain and hide it — markers are x-only.
  const emptyChart = series.length === 0 && bars.length === 0

  // Legend hover → "glow" the hovered series (emphasise it, dim the rest).
  const [hoveredSeries, setHoveredSeries] = useState<string | null>(null)
  // Emphasis for a series id given what (if anything) is hovered.
  const seriesEmphasis = (id: string): 'on' | 'off' | 'dim' =>
    hoveredSeries === null ? 'off' : hoveredSeries === id ? 'on' : 'dim'
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
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          barGap={0}
          barCategoryGap="18%"
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
          {/* Vertical lines delimit each time unit; suppressed when dense to avoid
              a wall of lines (the hover band still highlights units at any density). */}
          <CartesianGrid stroke={colors.grid} vertical={data.length <= 60} />
          {/* Always-on top/bottom notches delimiting each time unit. */}
          <Customized component={makeUnitTicks(colors.axis)} />
          {dragging && drag && (
            <ReferenceArea
              x1={data[Math.min(drag.startIdx, drag.endIdx)].label}
              x2={data[Math.max(drag.startIdx, drag.endIdx)].label}
              fill={colors.axis}
              fillOpacity={0.15}
              strokeOpacity={0}
            />
          )}
          <XAxis
            dataKey="label"
            tick={{ fill: colors.axis, fontSize: 12 }}
            tickMargin={8}
            minTickGap={44}
            axisLine={{ stroke: colors.grid }}
            tickLine={{ stroke: colors.grid }}
          />
          <YAxis
            tick={{ fill: colors.axis, fontSize: 12 }}
            tickMargin={8}
            width={56}
            hide={emptyChart}
            domain={emptyChart ? [0, 1] : undefined}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) =>
              percent
                ? `${v > 0 ? '+' : ''}${v}%`
                : v.toLocaleString(undefined, { maximumFractionDigits: 1 })
            }
          />
          {/* Hidden axis that keeps sales bars in the lower band of the plot. */}
          {barIds.length > 0 && <YAxis yAxisId="sales" hide domain={barDomain} />}
          {/* Category x-axis → Recharts renders the cursor as a band, so a fill
              highlights the whole hovered time unit (not just a line). */}
          <Tooltip
            cursor={{ fill: colors.axis, fillOpacity: 0.12 }}
            content={
              <ChartTooltip
                series={allSeries}
                lineIds={lineIds}
                colors={colors}
                percent={percent}
                bucketEvents={bucketEvents}
              />
            }
          />
          <Legend
            onMouseEnter={(o) => {
              const p = o as { dataKey?: string | number; value?: string }
              const id = p.dataKey ?? p.value
              setHoveredSeries(id != null ? String(id) : null)
            }}
            onMouseLeave={() => setHoveredSeries(null)}
            formatter={(value: string) => (
              <span style={{ color: colors.inkMuted, fontSize: 12, cursor: 'pointer' }}>
                {labelById.get(value) ?? value}
              </span>
            )}
          />
          {/* Sales bars first, so the trend lines draw on top of them. */}
          {bars.map((s) => {
            const emph = seriesEmphasis(s.id)
            return (
              <Bar
                key={s.id}
                yAxisId="sales"
                dataKey={s.id}
                name={s.id}
                fill={colorById[s.id] ?? colors.categorical[0]}
                fillOpacity={emph === 'on' ? 0.9 : emph === 'dim' ? 0.12 : 0.5}
                isAnimationActive={false}
                maxBarSize={48}
              />
            )
          })}
          {series.map((s) => {
            const emph = seriesEmphasis(s.id)
            return (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.id}
                stroke={colorById[s.id] ?? colors.categorical[0]}
                strokeWidth={emph === 'on' ? 4 : 2}
                strokeOpacity={emph === 'dim' ? 0.18 : 1}
                dot={showDots ? { r: 2.5, strokeWidth: 0 } : false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
                connectNulls
              />
            )
          })}
          {/* Event markers last, so they draw ON TOP of the bars and lines.
              Event-legend hover glows the matching marker and dims the rest. */}
          {eventMarkers?.map((m) => {
            const k = markerKey(m)
            const on = hoveredMarkerKey === k
            const dim = hoveredMarkerKey != null && !on
            return m.startLabel === m.endLabel ? (
              <ReferenceLine
                key={k}
                x={m.startLabel}
                stroke={TIER_COLOR[m.tier]}
                strokeDasharray={on ? undefined : '3 3'}
                strokeWidth={on ? 2.5 : 1}
                strokeOpacity={dim ? 0.15 : on ? 1 : 0.8}
                label={<MarkerLabel color={TIER_COLOR[m.tier]} names={m.names} />}
              />
            ) : (
              <ReferenceArea
                key={k}
                x1={m.startLabel}
                x2={m.endLabel}
                fill={TIER_COLOR[m.tier]}
                fillOpacity={dim ? 0.04 : on ? 0.3 : 0.12}
                stroke={TIER_COLOR[m.tier]}
                strokeOpacity={dim ? 0.1 : on ? 0.8 : 0.35}
                label={<MarkerLabel color={TIER_COLOR[m.tier]} names={m.names} />}
              />
            )
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
