import type { DemoTask } from '../types/task'

export const SALES_FILE = {
  name: '2026年销售数据.xlsx',
  type: 'Excel',
  size: '2.4 MB',
} as const

export const SALES_ANALYSIS_TASK: DemoTask = {
  id: 'sales-analysis-2026',
  createdAt: '2026-08-10T00:00:00.000Z',
  title: '分析 2026 年销售数据并生成报告',
  fileName: SALES_FILE.name,
  taskFileId: '',
  steps: [
    { id: 'read-sheet', title: '读取销售表格', status: 'pending' },
    { id: 'check-data', title: '检查数据完整性', status: 'pending' },
    { id: 'analyze-trend', title: '分析整体销售趋势', status: 'pending' },
    { id: 'compare-regions', title: '对比不同地区表现', status: 'pending' },
    { id: 'create-charts', title: '生成销售图表', status: 'pending' },
    { id: 'write-report', title: '编写分析报告', status: 'pending' },
  ],
}

export function isSalesTableAnalysisIntent(text: string) {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[\s，。！？、,.!?；;：:]/g, '')
  const hasAnalysisIntent =
    normalized.includes('分析') ||
    normalized.includes('看看') ||
    normalized.includes('看一看') ||
    normalized.includes('看下') ||
    normalized.includes('查看')
  const referencesSalesSpreadsheet =
    normalized.includes('表格') ||
    normalized.includes('excel') ||
    normalized.includes('销售数据') ||
    normalized.includes('销售表')

  return hasAnalysisIntent && referencesSalesSpreadsheet
}
