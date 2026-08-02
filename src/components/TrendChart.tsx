import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTheme } from '../hooks/useTheme'
import { chartColors } from '../lib/chartColors'
import type { Metric, Point } from '../lib/data'

interface Props {
  points: Point[]
  metric: Metric
}

// Recharts injects active/payload/label into the content element at render time.
interface TooltipInjectedProps {
  active?: boolean
  payload?: Array<{ payload: Point }>
}

function TrendTooltip({
  active,
  payload,
  metric,
  colors,
}: TooltipInjectedProps & {
  metric: Metric
  colors: ReturnType<typeof chartColors>
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{
        background: colors.surface,
        borderColor: colors.border,
        color: colors.ink,
      }}
    >
      <div className="font-medium">{point.full}</div>
      <div style={{ color: colors.inkMuted }}>
        {metric.label}:{' '}
        <span style={{ color: colors.ink }} className="font-semibold tabular-nums">
          {point.value}
          {metric.unit && ` ${metric.unit}`}
        </span>
      </div>
    </div>
  )
}

export function TrendChart({ points, metric }: Props) {
  const { theme } = useTheme()
  const colors = chartColors(theme)

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
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
            width={48}
            axisLine={false}
            tickLine={false}
            unit={metric.unit ? ` ${metric.unit}` : ''}
          />
          <Tooltip
            cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
            content={<TrendTooltip metric={metric} colors={colors} />}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={colors.series1}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
