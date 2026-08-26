import type { SalesDataPoint } from '../../data/mockResults'

type SalesTrendChartProps = {
  data: SalesDataPoint[]
}

const WIDTH = 560
const HEIGHT = 220
const PADDING = { top: 24, right: 24, bottom: 36, left: 42 }
const MIN_VALUE = 70
const MAX_VALUE = 120

export function SalesTrendChart({ data }: SalesTrendChartProps) {
  const plotWidth = WIDTH - PADDING.left - PADDING.right
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom
  const points = data.map((item, index) => {
    const x = PADDING.left + (plotWidth * index) / Math.max(1, data.length - 1)
    const y = PADDING.top + plotHeight - ((item.value - MIN_VALUE) / (MAX_VALUE - MIN_VALUE)) * plotHeight
    return { ...item, x, y }
  })
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ')

  return (
    <svg
      className="sales-trend-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="1月至6月月度销售趋势折线图，单位万元"
    >
      <title>月度销售趋势</title>
      {[80, 100, 120].map((value) => {
        const y = PADDING.top + plotHeight - ((value - MIN_VALUE) / (MAX_VALUE - MIN_VALUE)) * plotHeight
        return (
          <g key={value}>
            <line className="sales-trend-chart__grid" x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} />
            <text className="sales-trend-chart__axis-label" x={PADDING.left - 10} y={y + 3} textAnchor="end">
              {value}
            </text>
          </g>
        )
      })}
      <polyline className="sales-trend-chart__line" points={linePoints} fill="none" />
      {points.map((point) => (
        <g key={point.label}>
          <circle className="sales-trend-chart__point" cx={point.x} cy={point.y} r="5" />
          <text className="sales-trend-chart__value" x={point.x} y={point.y - 12} textAnchor="middle">
            {point.value}
          </text>
          <text className="sales-trend-chart__month" x={point.x} y={HEIGHT - 12} textAnchor="middle">
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
