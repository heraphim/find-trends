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
}

interface TooltipInjectedProps {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number; color: string }>
}

function fmtPct(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

function ChartTooltip({
  active,
  payload,
  series,
  colors,
}: TooltipInjectedProps & {
  series: SeriesSpec[]
  colors: ReturnType<typeof chartColors>
}) {
  if (!active || !payload?.length) return null
  const full = (payload[0] as unknown as { payload: ChartRow }).payload.full
  const labelById = new Map(series.map((s) => [s.id, s.label]))
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{ background: colors.surface, borderColor: colors.border, color: colors.ink }}
    >
      <div className="mb-1 font-medium">{full}</div>
      <div className="flex flex-col gap-0.5">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: p.color }}
            />
            <span style={{ color: colors.inkMuted }}>{labelById.get(p.dataKey) ?? p.dataKey}</span>
            <span className="ml-auto font-semibold tabular-nums">{fmtPct(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MultiTrendChart({ data, series }: Props) {
  const { theme } = useTheme()
  const colors = chartColors(theme)
  const labelById = new Map(series.map((s) => [s.id, s.label]))

  return (
    <div className="h-96 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
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
            tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`}
          />
          <Tooltip
            cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
            content={<ChartTooltip series={series} colors={colors} />}
          />
          <Legend
            formatter={(value: string) => (
              <span style={{ color: colors.inkMuted, fontSize: 12 }}>
                {labelById.get(value) ?? value}
              </span>
            )}
          />
          {series.map((s, i) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.id}
              stroke={colors.categorical[i % colors.categorical.length]}
              strokeWidth={2}
              dot={false}
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
