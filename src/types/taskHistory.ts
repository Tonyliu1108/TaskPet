import type { ExcelAnalysisResult, ExcelInsightsResult } from './excel'

export type HistoryInsightsSnapshot = Omit<ExcelInsightsResult, 'diagnostics'>

export type TaskHistoryEntry = {
  version: 1
  taskId: string
  title: string
  fileId: string
  fileName: string
  createdAt: string
  completedAt: string
  status: 'completed'
  analysisSnapshot: ExcelAnalysisResult
  insightsSnapshot: HistoryInsightsSnapshot | null
}

export type TaskHistoryState = {
  version: 1
  entries: TaskHistoryEntry[]
}
