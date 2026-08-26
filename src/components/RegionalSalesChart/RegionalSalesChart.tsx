import type { CSSProperties } from 'react'
import type { SalesDataPoint } from '../../data/mockResults'

type RegionalSalesChartProps = {
  data: SalesDataPoint[]
  focusRegionalDecline: boolean
}

export function RegionalSalesChart({ data, focusRegionalDecline }: RegionalSalesChartProps) {
  const maxValue = Math.max(...data.map((item) => item.value))

  return (
    <div
      className="regional-sales-chart"
      role="img"
      aria-label="华北、华东、华南和西部地区销售额对比图，单位万元"
    >
      {data.map((item) => {
        const isFocused = focusRegionalDecline && item.label === '华东'
        return (
          <div
            className={`regional-sales-chart__row ${isFocused ? 'regional-sales-chart__row--focused' : ''}`}
            key={item.label}
            data-region={item.label}
            data-highlighted={isFocused ? 'true' : 'false'}
          >
            <span className="regional-sales-chart__label">{item.label}</span>
            <span className="regional-sales-chart__track">
              <i
                className="regional-sales-chart__bar"
                style={{ '--bar-width': `${(item.value / maxValue) * 100}%` } as CSSProperties}
              />
            </span>
            <strong>{item.value}</strong>
            {isFocused && <em>重点分析</em>}
          </div>
        )
      })}
    </div>
  )
}
