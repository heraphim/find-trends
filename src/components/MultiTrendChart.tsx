import { useRef, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Customized,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  usePlotArea,
  useXAxisScale,
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
  selectedT?: number | null // the clicked/selected bucket, highlighted like hover
}

// A marker's stable key (must match the event legend's key).
function markerKey(m: EventMarker): string {
  return `${m.startLabel}|${m.endLabel}`
}

// The x-positions of the boundaries BETWEEN time units (n buckets → n+1 edges),
// derived from the bucket centers as the midpoints between adjacent centers.
// We can't ask the scale for a band's start/end directly: a ComposedChart with
// no bars uses a `point` scale, where `position:'start'/'middle'/'end'` all
// collapse to the same center (only a `band` scale, present when sales bars are
// shown, has a real bandwidth). Midpoints-between-centers give true boundaries
// for both. The two outer edges are extrapolated (half a step past the first/
// last center) and clamped to the plot rect.
function bucketCenters(
  labels: string[],
  scale: NonNullable<ReturnType<typeof useXAxisScale>>,
): number[] {
  const centers: number[] = []
  for (const l of labels) {
    const c = scale(l, { position: 'middle' })
    if (typeof c === 'number') centers.push(c)
  }
  return centers
}
function boundariesFromCenters(centers: number[], left: number, right: number): number[] {
  const n = centers.length
  if (n === 0) return []
  if (n === 1) return [left, right]
  const edges: number[] = new Array(n + 1)
  for (let i = 1; i < n; i++) edges[i] = (centers[i - 1] + centers[i]) / 2
  edges[0] = Math.max(left, centers[0] - (centers[1] - centers[0]) / 2)
  edges[n] = Math.min(right, centers[n - 1] + (centers[n - 1] - centers[n - 2]) / 2)
  return edges
}

// Vertical delimiters at each time-unit boundary (the *sides* of every unit, not
// their centers). Full-height gridlines when the chart is sparse (≤60 buckets);
// short top/bottom notches — thinned when boundaries would overlap — when dense,
// so the day/week/month limits stay readable at any density. Rendered inside a
// <Customized> host so the Recharts v3 layout hooks (plot rect + category scale)
// resolve.
const NOTCH = 6 // px
function UnitBoundaries({
  labels,
  full,
  gridColor,
  tickColor,
}: {
  labels: string[]
  full: boolean
  gridColor: string
  tickColor: string
}) {
  const plot = usePlotArea()
  const scale = useXAxisScale()
  if (!plot || typeof scale !== 'function' || labels.length === 0) return null
  const edges = boundariesFromCenters(bucketCenters(labels, scale), plot.x, plot.x + plot.width)
  if (edges.length === 0) return null
  const top = plot.y
  const h = plot.height

  if (full) {
    return (
      <g pointerEvents="none">
        {edges.map((x, i) => (
          <line key={i} x1={x} x2={x} y1={top} y2={top + h} stroke={gridColor} strokeWidth={1} />
        ))}
      </g>
    )
  }

  const spacing = edges.length > 1 ? plot.width / (edges.length - 1) : plot.width
  const step = spacing > 0 && spacing < 6 ? Math.ceil(6 / spacing) : 1
  return (
    <g pointerEvents="none">
      {edges.map((x, i) =>
        i % step === 0 || i === edges.length - 1 ? (
          <g key={i}>
            <line x1={x} x2={x} y1={top} y2={top + NOTCH} stroke={tickColor} strokeWidth={1} strokeOpacity={0.75} />
            <line x1={x} x2={x} y1={top + h - NOTCH} y2={top + h} stroke={tickColor} strokeWidth={1} strokeOpacity={0.75} />
          </g>
        ) : null,
      )}
    </g>
  )
}

// Curated event markers as shaded bands. Each event covers its FULL day-span —
// start edge of its first bucket to the end edge of its last — so a single-day
// event fills that whole day exactly like a multi-day event fills its range
// (rather than a thin mid-unit line). Uses the same boundary geometry as
// UnitBoundaries so band edges line up with the unit delimiters, and works on
// both point and band scales. Drawn behind the series (zIndex-0 Customized layer,
// which paints above the grid but below bars/lines). Event-legend hover glows the
// matching band (hoveredKey) and dims the rest.
function EventBands({
  markers,
  labels,
  hoveredKey,
}: {
  markers: EventMarker[]
  labels: string[]
  hoveredKey?: string | null
}) {
  const plot = usePlotArea()
  const scale = useXAxisScale()
  if (!plot || typeof scale !== 'function' || markers.length === 0 || labels.length === 0) return null
  const edges = boundariesFromCenters(bucketCenters(labels, scale), plot.x, plot.x + plot.width)
  if (edges.length === 0) return null
  const idxByLabel = new Map(labels.map((l, i) => [l, i]))

  return (
    <g pointerEvents="none">
      {markers.map((m) => {
        const a = idxByLabel.get(m.startLabel)
        const b = idxByLabel.get(m.endLabel)
        if (a == null || b == null) return null
        const lo = Math.min(a, b)
        const hi = Math.max(a, b)
        const x1 = edges[lo]
        const x2 = edges[hi + 1]
        if (typeof x1 !== 'number' || typeof x2 !== 'number') return null
        const w = x2 - x1
        if (w <= 0) return null
        const k = markerKey(m)
        const on = hoveredKey === k
        const dim = hoveredKey != null && !on
        const color = TIER_COLOR[m.tier]
        return (
          <g key={k}>
            <rect
              x={x1}
              y={plot.y}
              width={w}
              height={plot.height}
              fill={color}
              fillOpacity={dim ? 0.04 : on ? 0.3 : 0.12}
              stroke={color}
              strokeOpacity={dim ? 0.1 : on ? 0.8 : 0.35}
              strokeWidth={1}
            />
            <circle
              cx={(x1 + x2) / 2}
              cy={plot.y + 4}
              r={3.5}
              fill={color}
              stroke="white"
              strokeWidth={1}
              strokeOpacity={dim ? 0.2 : 1}
              fillOpacity={dim ? 0.2 : 1}
            />
          </g>
        )
      })}
    </g>
  )
}

// Persistent highlight for the selected bucket — the same full-unit band the
// hover cursor paints, but pinned (dashed outline) so a clicked day/week/month
// stays marked on the chart. Hosted in a <Customized> so the layout hooks
// resolve; centered on the unit via the category scale, width = one bucket.
function SelectedBand({
  label,
  bucketCount,
  fill,
}: {
  label: string
  bucketCount: number
  fill: string
}) {
  const plot = usePlotArea()
  const scale = useXAxisScale()
  if (!plot || typeof scale !== 'function' || bucketCount <= 0) return null
  const cx = scale(label, { position: 'middle' })
  if (typeof cx !== 'number') return null
  const band = plot.width / bucketCount
  const x1 = Math.max(plot.x, cx - band / 2)
  const x2 = Math.min(plot.x + plot.width, cx + band / 2)
  const w = x2 - x1
  if (w <= 0) return null
  return (
    <g pointerEvents="none">
      <rect x={x1} y={plot.y} width={w} height={plot.height} fill={fill} fillOpacity={0.1} />
      <rect
        x={x1}
        y={plot.y}
        width={w}
        height={plot.height}
        fill="none"
        stroke={fill}
        strokeOpacity={0.45}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
    </g>
  )
}

// Recharts draws a vertical *line* cursor for a ComposedChart (the rectangle
// band branch in its Cursor is BarChart-only), so hovering a unit would show a
// thin mid-line. This custom cursor paints the whole hovered time-unit band
// instead. Recharts clones the element with `points` (the line's top/bottom
// endpoints, centered on the hovered unit) plus the plot-rect offset spread
// flat as top-level `left`/`width` props; we widen that into a band
// `plotWidth / bucketCount` across, clamped so edge units don't spill past the
// axis.
function BandCursor(props: {
  bucketCount: number
  fill: string
  fillOpacity: number
  points?: { x: number; y: number }[]
  left?: number
  width?: number
}) {
  const { bucketCount, fill, fillOpacity, points, left, width } = props
  if (!points || points.length < 2 || left == null || width == null || bucketCount <= 0) return null
  const band = width / bucketCount
  const x1 = Math.max(left, points[0].x - band / 2)
  const x2 = Math.min(left + width, points[0].x + band / 2)
  const w = x2 - x1
  if (w <= 0) return null
  return (
    <rect
      x={x1}
      y={points[0].y}
      width={w}
      height={points[1].y - points[0].y}
      fill={fill}
      fillOpacity={fillOpacity}
      pointerEvents="none"
    />
  )
}

// Sales bars sit in the lower band of the plot: give them a dedicated (hidden)
// axis whose top is padded well above the data so the tallest bar reaches only
// ~1/3 of the height, leaving the upper area for the trend lines.
// Domain for the hidden sales axis. `headroom` is how much of the axis is left
// empty above the tallest bar, as a multiple of the data range: 2 pins the bars
// into the lower ~third of the plot (so trend lines have room above them), while
// a small value lets a bars-only chart fill most of its height.
function salesDomain(data: ChartRow[], barIds: string[], headroom: number): [number, number] {
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
  return [min, max + (max - min) * headroom]
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
  // Drop internal helper series (e.g. the events-only `__ev` baseline).
  const rows = payload.filter((p) => !String(p.dataKey).startsWith('__'))
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
        {rows.map((p) => (
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
  selectedT,
}: Props) {
  const { theme } = useTheme()
  const colors = chartColors(theme)
  // Label of the selected bucket → a persistent highlight band on that unit.
  const selectedLabel =
    selectedT != null ? (data.find((d) => d.t === selectedT)?.label ?? null) : null
  const bars = barSeries ?? []
  const allSeries = [...series, ...bars]
  const lineIds = new Set(series.map((s) => s.id))
  const barIds = bars.map((s) => s.id)
  const labelById = new Map(allSeries.map((s) => [s.id, s.label]))
  // With no trend lines, let the sales bars use most of the vertical space
  // (small headroom); with lines present, keep them in the lower band.
  const barDomain = salesDomain(data, barIds, series.length === 0 ? 0.15 : 2)
  // No line series on the main axis (an events-only chart, OR a sales-bars-only
  // chart — bars live on their own hidden axis and don't anchor the main one):
  // Recharts v3 only draws ReferenceLine/Area when a graphical series exists on
  // the axis, so we add one invisible baseline line (dataKey `__ev`) and pin the
  // y-axis to a dummy [0,1] domain. Otherwise event markers vanish whenever the
  // only plotted content is sales bars.
  const emptyChart = series.length === 0
  const plotData = emptyChart ? data.map((d) => ({ ...d, __ev: 0 })) : data
  // The main (left) y-axis only carries the trend lines. With no line series —
  // an events-only chart, or a sales-bars-only chart (bars live on their own
  // hidden axis) — it has nothing to label, so collapse its reserved width
  // instead of leaving ~56px of blank gutter down the left of the plot.
  const hideMainAxis = series.length === 0

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
          data={plotData}
          margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
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
          {/* Horizontal gridlines only. The vertical unit delimiters are drawn at
              unit BOUNDARIES (the sides), not the centers Recharts' own vertical
              grid would use, by UnitBoundaries below. */}
          <CartesianGrid stroke={colors.grid} vertical={false} />
          {/* Vertical delimiters at each time-unit boundary: full-height lines
              when sparse (≤60 buckets), short top/bottom notches when dense. */}
          <Customized
            component={() => (
              <UnitBoundaries
                labels={data.map((d) => d.label)}
                full={data.length <= 60}
                gridColor={colors.grid}
                tickColor={colors.axis}
              />
            )}
          />
          {selectedLabel && (
            <Customized
              component={() => (
                <SelectedBand label={selectedLabel} bucketCount={data.length} fill={colors.axis} />
              )}
            />
          )}
          {dragging && drag && (
            <ReferenceArea
              x1={data[Math.min(drag.startIdx, drag.endIdx)].label}
              x2={data[Math.max(drag.startIdx, drag.endIdx)].label}
              fill={colors.axis}
              fillOpacity={0.18}
              strokeOpacity={0}
              // ReferenceArea defaults to zIndex 100 (below grid/bars/lines), so
              // the selection was buried behind the series. Lift it just under
              // the hover band (cursorLine = 1100) so it reads on top.
              zIndex={1050}
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
          {/* Empty (events-only) chart: keep the y-axis + its [0,1] scale so the
              event markers still anchor, but render it invisibly (no ticks). */}
          <YAxis
            tick={hideMainAxis ? false : { fill: colors.axis, fontSize: 12 }}
            tickMargin={8}
            width={hideMainAxis ? 8 : 56}
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
          {/* A ComposedChart's built-in cursor is a vertical line; BandCursor
              paints the whole hovered time-unit band instead (not just a line). */}
          <Tooltip
            cursor={<BandCursor bucketCount={data.length} fill={colors.axis} fillOpacity={0.12} />}
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
          {/* Invisible baseline so an events-only chart has a graphical series
              (v3 needs one for ReferenceLine/Area to render). */}
          {emptyChart && (
            <Line
              dataKey="__ev"
              stroke="transparent"
              dot={false}
              activeDot={false}
              legendType="none"
              isAnimationActive={false}
            />
          )}
          {/* Event markers as shaded full-day bands (single- and multi-day alike),
              drawn behind the series. Event-legend hover glows the matching band. */}
          {eventMarkers && eventMarkers.length > 0 && (
            <Customized
              component={() => (
                <EventBands
                  markers={eventMarkers}
                  labels={data.map((d) => d.label)}
                  hoveredKey={hoveredMarkerKey}
                />
              )}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
