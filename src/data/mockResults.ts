export type SalesDataPoint = {
  label: string
  value: number
}

export type SalesSummary = {
  totalSales: string
  yearOverYearGrowth: string
  topRegion: string
  topProductContribution: string
}

export type SalesResults = {
  sourceFile: string
  monthlySales: SalesDataPoint[]
  regionalSales: SalesDataPoint[]
  summary: SalesSummary
  findings: string[]
  focusedRegionalFinding: string
  recommendations: string[]
  report: {
    fileName: string
    fileMeta: string
  }
}

export const monthlySales: SalesDataPoint[] = [
  { label: '1月', value: 82 },
  { label: '2月', value: 88 },
  { label: '3月', value: 95 },
  { label: '4月', value: 91 },
  { label: '5月', value: 104 },
  { label: '6月', value: 116 },
]

export const regionalSales: SalesDataPoint[] = [
  { label: '华北', value: 108 },
  { label: '华东', value: 92 },
  { label: '华南', value: 121 },
  { label: '西部', value: 76 },
]

export const salesSummary: SalesSummary = {
  totalSales: '612 万元',
  yearOverYearGrowth: '+12.4%',
  topRegion: '华南',
  topProductContribution: '46%',
}

export const MOCK_SALES_RESULTS: SalesResults = {
  sourceFile: '2026年销售数据.xlsx',
  monthlySales,
  regionalSales,
  summary: salesSummary,
  findings: [
    '总销售额同比增长 12.4%，整体保持增长趋势。',
    '华东地区销售额表现弱于华北和华南，是当前主要关注区域。',
    '核心产品贡献约 46% 的销售额，销售结构存在一定集中度。',
  ],
  focusedRegionalFinding: '华东地区销售额下降约 8.1%，建议优先检查渠道、客户流失和区域需求变化。',
  recommendations: [
    '优先复盘华东地区渠道和重点客户变化，制定针对性恢复方案。',
    '加大高增长产品和华南地区资源投入，同时控制销售结构过度集中风险。',
    '建立月度区域销售预警机制，对连续下滑地区提前触发复盘。',
  ],
  report: {
    fileName: '2026年销售分析报告.pdf',
    fileMeta: 'PDF · 2.1 MB',
  },
}

export const RESULT_STORAGE_KEYS = {
  results: 'taskpet.demo.results',
  resultReady: 'taskpet.demo.resultReady',
  hasCelebrated: 'taskpet.demo.hasCelebrated',
} as const

export function isSalesResults(value: unknown): value is SalesResults {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<SalesResults>

  return (
    result.sourceFile === MOCK_SALES_RESULTS.sourceFile &&
    Array.isArray(result.monthlySales) &&
    result.monthlySales.length === 6 &&
    Array.isArray(result.regionalSales) &&
    result.regionalSales.length === 4 &&
    typeof result.summary === 'object' &&
    result.summary !== null &&
    Array.isArray(result.findings) &&
    result.findings.length === 3 &&
    Array.isArray(result.recommendations) &&
    result.recommendations.length === 3 &&
    typeof result.report === 'object' &&
    result.report !== null
  )
}
