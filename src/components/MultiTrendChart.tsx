import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTheme } from '../hooks/useTheme'
import { chartColors } from '../lib/chartColors'
import type { ChartRow, SeriesSpec } from '../lib/data'

interface Props {
  data: ChartRow[]
  series: SeriesSpec[]
  colorById: Record<string, string>
  percent?: boolean
  onPointClick?: (bucketT: number) => void
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
}: TooltipInjectedProps & {
  series: SeriesSpec[]
  colors: ReturnType<typeof chartColors>
  percent?: boolean
}) {
  if (!active || !payload?.length) return null
  const row = (payload[0] as unknown as { payload: ChartRow }).payload
  const full = row.full
  const days = row._days as number | undefined
  const labelById = new Map(series.map((s) => [s.id, s.label]))
  const unitById = new Map(series.map((s) => [s.id, s.unit]))
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
    </div>
  )
}

export function MultiTrendChart({ data, series, colorById, percent, onPointClick }: Props) {
  const { theme } = useTheme()
  const colors = chartColors(theme)
  const labelById = new Map(series.map((s) => [s.id, s.label]))
  // With few points, draw dots so single/sparse days are visible.
  const showDots = data.length <= 40

  return (
    <div className={'h-96 w-full' + (onPointClick ? ' cursor-pointer' : '')}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          onClick={(state: unknown) => {
            // recharts v3 passes activeIndex (not activePayload); map it to our row.
            const idx = Number((state as { activeIndex?: number | string })?.activeIndex)
            if (Number.isInteger(idx) && idx >= 0 && idx < data.length) {
              const t = data[idx].t
              if (typeof t === 'number') onPointClick?.(t)
            }
          }}
        >
          <CartesianGrid stroke={colors.grid} vertical={false} />
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
            content={<ChartTooltip series={series} colors={colors} percent={percent} />}
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
