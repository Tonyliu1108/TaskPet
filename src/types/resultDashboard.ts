import type {
  AiInsightsStatus,
  BusinessInsights,
  ExcelAnalysisResult,
  InsightEvidence,
} from './excel'

export type ResultDashboardMode = 'current' | 'history'

export type ResultDashboardData = {
  mode: ResultDashboardMode
  task: {
    taskId: string
    title: string
    fileName: string
    createdAt: string
    completedAt?: string
  }
  analysis: ExcelAnalysisResult
  insights: BusinessInsights | null
  evidenceRegistry: Record<string, InsightEvidence>
  meta: {
    aiStatus: AiInsightsStatus
    aiError: string | null
    aiLoadingMessage: string | null
    modelUsed: string | null
    fallbackUsed: boolean | null
  }
}
