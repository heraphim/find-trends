import { useEffect, useId, useRef, useState } from 'react'
import { useChartGestures } from '../hooks/useChartGestures'
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
  key: string // stable identity (span + color) — shared with the marker legend for hover glow
  startLabel: string // bucket label of the event's start (must match an x-axis label)
  endLabel: string // bucket label of the event's end; === startLabel for single-bucket events
  tier: Tier
  names: string[]
  color?: string // city series color for local events (tinted band); tier color otherwise
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

// A marker's stable key comes precomputed from buildMarkers (span + color).
function markerKey(m: EventMarker): string {
  return m.key
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
  // Wheel/pinch zoom (factor <1 in, >1 out; anchorFraction 0..1 across the width)
  // and middle-drag horizontal pan (fraction of width since the drag began).
  onGestureZoom?: (factor: number, anchorFraction: number) => void
  onGesturePan?: (fraction: number, phase: 'move' | 'end') => void
  hoveredMarkerKey?: string | null // event-legend hover → glow that marker
  selectedT?: number | null // the clicked/selected bucket, highlighted like hover
  highlightIds?: string[] | null // correlation-row hover → glow these series, dim the rest
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
  hatchInk,
}: {
  markers: EventMarker[]
  labels: string[]
  hoveredKey?: string | null
  hatchInk: string // stroke for the overlap hatch patterns
}) {
  const uid = useId()
  const plot = usePlotArea()
  const scale = useXAxisScale()
  if (!plot || typeof scale !== 'function' || markers.length === 0 || labels.length === 0) return null
  const edges = boundariesFromCenters(bucketCenters(labels, scale), plot.x, plot.x + plot.width)
  if (edges.length === 0) return null
  const idxByLabel = new Map(labels.map((l, i) => [l, i]))

  // Resolve each marker to its pixel band first, so overlaps can be computed.
  const bands = markers.flatMap((m) => {
    const a = idxByLabel.get(m.startLabel)
    const b = idxByLabel.get(m.endLabel)
    if (a == null || b == null) return []
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const x1 = edges[lo]
    const x2 = edges[hi + 1]
    if (typeof x1 !== 'number' || typeof x2 !== 'number' || x2 - x1 <= 0) return []
    return [{ m, x1, x2 }]
  })

  // Sweep-line: cut the x-axis at every band edge; each segment's overlap depth
  // is how many bands cover it. Depth 2 → one-direction diagonal hatch; 3+ →
  // cross-hatch — so stacked events read as *distinctly* overlapping rather than
  // as one darker band.
  const cuts = [...new Set(bands.flatMap((b) => [b.x1, b.x2]))].sort((a, b) => a - b)
  const overlaps: { x1: number; x2: number; depth: number }[] = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const [sx, ex] = [cuts[i], cuts[i + 1]]
    const depth = bands.filter((b) => b.x1 < ex && b.x2 > sx).length
    if (depth >= 2) overlaps.push({ x1: sx, x2: ex, depth })
  }
  const h2 = `${uid}h2`
  const h3 = `${uid}h3`

  return (
    <g pointerEvents="none">
      <defs>
        {/* depth 2: one-direction diagonals */}
        <pattern id={h2} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={7} stroke={hatchInk} strokeWidth={1} strokeOpacity={0.4} />
        </pattern>
        {/* depth 3+: cross-hatch (both diagonals + H/V grid) */}
        <pattern id={h3} width={8} height={8} patternUnits="userSpaceOnUse">
          <path
            d="M0,0 l8,8 M8,0 l-8,8 M0,4 h8 M4,0 v8"
            stroke={hatchInk}
            strokeWidth={1}
            strokeOpacity={0.35}
            fill="none"
          />
        </pattern>
      </defs>
      {bands.map(({ m, x1, x2 }) => {
        const w = x2 - x1
        const k = markerKey(m)
        const on = hoveredKey === k
        const dim = hoveredKey != null && !on
        // Local events tint with their city's series color; others by tier.
        const color = m.color ?? TIER_COLOR[m.tier]
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
      {/* Overlap hatching on top of the tinted bands (hidden while a legend
          entry is hovered, so the glowed band reads clean). */}
      {hoveredKey == null &&
        overlaps.map((o, i) => (
          <rect
            key={i}
            x={o.x1}
            y={plot.y}
            width={o.x2 - o.x1}
            height={plot.height}
            fill={`url(#${o.depth >= 3 ? h3 : h2})`}
          />
        ))}
    </g>
  )
}

// Persistent highlight for the selected bucket — the same full-unit band the
// hover cursor paints, but pinned (dashed outline) so a clicked day/week/month
// stays marked on the chart. Hosted in a <Customized> so the layout hooks
// resolve; spans the unit's real cell (boundary to boundary, same geometry as
// UnitBoundaries/EventBands) so it lines up with the drawn delimiters on both
// point and band scales.
function SelectedBand({
  label,
  labels,
  fill,
}: {
  label: string
  labels: string[]
  fill: string
}) {
  const plot = usePlotArea()
  const scale = useXAxisScale()
  if (!plot || typeof scale !== 'function' || labels.length === 0) return null
  const i = labels.indexOf(label)
  if (i < 0) return null
  const edges = boundariesFromCenters(bucketCenters(labels, scale), plot.x, plot.x + plot.width)
  const x1 = edges[i]
  const x2 = edges[i + 1]
  if (typeof x1 !== 'number' || typeof x2 !== 'number') return null
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
// flat as top-level `left`/`width` props; we widen that into the unit's cell,
// clamped so edge units don't spill past the axis. The cell width depends on
// the x-scale: a band scale (sales bars present) tiles the plot into
// `bucketCount` bands, but a point scale (lines only) spreads the centers
// across the width in `bucketCount - 1` steps — using the wrong one leaves the
// rect misaligned with the unit delimiters, straddling two units.
function BandCursor(props: {
  bucketCount: number
  pointScale: boolean // true when no bars are plotted (category axis → point scale)
  fill: string
  fillOpacity: number
  points?: { x: number; y: number }[]
  left?: number
  width?: number
}) {
  const { bucketCount, pointScale, fill, fillOpacity, points, left, width } = props
  if (!points || points.length < 2 || left == null || width == null || bucketCount <= 0) return null
  const band = pointScale && bucketCount > 1 ? width / (bucketCount - 1) : width / bucketCount
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
  onGestureZoom,
  onGesturePan,
  hoveredMarkerKey,
  selectedT,
  highlightIds,
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
  // External highlight (hovering a correlation row glows both of its series)
  // takes precedence over the single legend-hovered series.
  const external = highlightIds && highlightIds.length > 0 ? highlightIds : null
  // Emphasis for a series id given what (if anything) is hovered.
  const seriesEmphasis = (id: string): 'on' | 'off' | 'dim' => {
    if (external) return external.includes(id) ? 'on' : 'dim'
    return hoveredSeries === null ? 'off' : hoveredSeries === id ? 'on' : 'dim'
  }
  // With few points, draw dots so single/sparse days are visible.
  const showDots = data.length <= 40

  // Drag-to-zoom: track the selected index span; commit on release. A ref mirrors
  // the span (and the mousedown x) so the window-level mouseup handler always sees
  // the latest values even though it's registered once per drag.
  type DragSpan = { startIdx: number; endIdx: number }
  const [drag, setDrag] = useState<DragSpan | null>(null)
  const dragRef = useRef<DragSpan | null>(null)
  const startXRef = useRef(0) // pointer clientX at mousedown, for the click-vs-drag threshold
  const draggedRef = useRef(false) // suppress the click that ends a drag
  // The pointer must travel this many px before a press counts as a zoom-drag
  // rather than a click, so a slightly-imperfect click still selects a unit.
  const DRAG_THRESHOLD = 6

  const updateDrag = (d: DragSpan | null) => {
    dragRef.current = d
    setDrag(d)
  }

  const finishDrag = () => {
    const d = dragRef.current
    if (d && d.startIdx !== d.endIdx && onZoom) {
      const a = data[Math.min(d.startIdx, d.endIdx)]?.t
      const b = data[Math.max(d.startIdx, d.endIdx)]?.t
      if (typeof a === 'number' && typeof b === 'number') {
        draggedRef.current = true
        onZoom(a, b)
      }
    }
    updateDrag(null)
  }

  const canZoom = !!onZoom && data.length > 1
  const dragging = drag !== null && drag.startIdx !== drag.endIdx

  // Wheel/pinch zoom + middle-drag pan, on native (non-passive) listeners.
  const wrapRef = useRef<HTMLDivElement>(null)
  useChartGestures(wrapRef, {
    onZoom: onGestureZoom,
    onPan: onGesturePan,
    // Stay enabled even at a SINGLE bucket: that's exactly when zoom-in must drill to
    // the finer unit (a lone year → its months). Gating on data.length > 1 detached
    // the wheel listener there, so the page scrolled instead of the chart zooming.
    enabled: !!onGestureZoom || !!onGesturePan,
  })

  // Recharts stores the hovered bucket (tooltip index, band cursor, active dots)
  // in its own store and recomputes it ONLY when a mouse event reaches its
  // wrapper — so when a wheel-zoom/pan/drill swaps `data` under a stationary
  // pointer, the stale index/coords describe a different unit on the new axis
  // until the mouse physically moves a pixel. Track the pointer while it's over
  // the chart and replay a mousemove at its last position after each data
  // change (next frame, so Recharts has laid out the new axis first).
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const track = (e: MouseEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY }
    }
    const clear = () => {
      pointerRef.current = null
    }
    el.addEventListener('mousemove', track)
    el.addEventListener('wheel', track) // wheel carries coords too — zooming without moving still tracks
    el.addEventListener('mouseleave', clear)
    return () => {
      el.removeEventListener('mousemove', track)
      el.removeEventListener('wheel', track)
      el.removeEventListener('mouseleave', clear)
    }
  }, [])
  useEffect(() => {
    if (!pointerRef.current) return
    const replay = () => {
      const p = pointerRef.current
      const el = wrapRef.current
      if (!p || !el) return
      // Must dispatch on the recharts wrapper (or a descendant) so the event
      // bubbles through the div carrying Recharts' onMouseMove handler.
      const surface = el.querySelector('.recharts-wrapper')
      surface?.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: p.x,
          clientY: p.y,
        }),
      )
    }
    // First replay next frame (fast path) — but Recharts updates its scale store
    // in PASSIVE effects that flush after paint, so an early replay computes the
    // hover index against the OLD axis (a zoom burst then shows a bucket from a
    // stale window — dates jump years at the same pixel). Re-assert once more
    // after the store has settled so the tooltip matches the pixel it's over.
    const raf = requestAnimationFrame(replay)
    const settle = window.setTimeout(replay, 80)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
    }
  }, [data])

  // Let a drag finish even when released outside the plot: while a drag is active,
  // a window-level mouseup commits it. Because onMouseMove stops firing once the
  // pointer leaves the chart, endIdx stays pinned to the last in-bounds time unit
  // — so dragging off the edge selects up to that unit instead of cancelling.
  useEffect(() => {
    if (drag === null) return
    const onUp = () => finishDrag()
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
    // finishDrag reads dragRef.current, so only "is a drag active" matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag === null])

  return (
    <div
      ref={wrapRef}
      className={
        'h-96 w-full touch-none' +
        (canZoom ? ' cursor-crosshair select-none' : onPointClick ? ' cursor-pointer' : '')
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={plotData}
          margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
          barGap={0}
          barCategoryGap={0}
          onMouseDown={(state: unknown, e: { clientX?: number; button?: number }) => {
            if (!canZoom) return
            // Left button only: the middle button is the horizontal-pan gesture
            // (useChartGestures), so it must not also start a range selection.
            if (e?.button !== undefined && e.button !== 0) return
            draggedRef.current = false // clear any stale flag from a prior gesture
            const idx = activeIndexOf(state, data)
            if (idx !== null) {
              startXRef.current = e?.clientX ?? 0
              updateDrag({ startIdx: idx, endIdx: idx })
            }
          }}
          onMouseMove={(state: unknown, e: { clientX?: number }) => {
            const d = dragRef.current
            if (!d) return
            const idx = activeIndexOf(state, data)
            if (idx === null) return
            // Only widen the selection once the pointer has moved past the
            // threshold; a near-still press stays a single-unit click.
            const moved =
              e?.clientX == null || Math.abs(e.clientX - startXRef.current) > DRAG_THRESHOLD
            const endIdx = moved ? idx : d.startIdx
            if (endIdx !== d.endIdx) updateDrag({ ...d, endIdx })
          }}
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
                <SelectedBand label={selectedLabel} labels={data.map((d) => d.label)} fill={colors.axis} />
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
            cursor={
              <BandCursor
                bucketCount={data.length}
                pointScale={barIds.length === 0}
                fill={colors.axis}
                fillOpacity={0.12}
              />
            }
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
            // Recharts defaults to itemSorter:'value', which re-orders legend
            // entries by each series' id string — a different order than the
            // bars/lines are declared and drawn in (so Brașov could sit left on
            // the chart but right in the legend). null keeps insertion order, so
            // the legend matches the visual series order.
            itemSorter={null}
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
                  hatchInk={colors.axis}
                />
              )}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
