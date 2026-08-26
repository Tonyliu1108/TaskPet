export const TASK_EXECUTION_STORAGE_KEYS = {
  currentStepIndex: 'taskpet.demo.currentStepIndex',
  focusRegionalDecline: 'taskpet.demo.focusRegionalDecline',
} as const

export const TASK_EXECUTION_CONFIG = [
  { stepId: 'read-sheet', durationMs: 1400, statusText: '正在读取销售表格' },
  { stepId: 'check-data', durationMs: 1400, statusText: '正在检查数据' },
  { stepId: 'analyze-trend', durationMs: 2000, statusText: '正在分析销售趋势' },
  { stepId: 'compare-regions', durationMs: 1500, statusText: '正在对比地区表现' },
  { stepId: 'create-charts', durationMs: 1700, statusText: '正在生成销售图表' },
  { stepId: 'write-report', durationMs: 1700, statusText: '正在编写分析报告' },
] as const

export const BUSINESS_CONFIRMATION_STEP_INDEX = 3

export function getTaskStepStatusText(stepId: string | undefined) {
  return TASK_EXECUTION_CONFIG.find((item) => item.stepId === stepId)?.statusText ?? null
}
