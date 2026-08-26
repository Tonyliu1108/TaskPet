import type { ExcelInsightsResult, AiInsightsStatus } from '../types/excel'
import type { ResultDashboardData } from '../types/resultDashboard'
import type { DemoTask } from '../types/task'
import type { HistoryInsightsSnapshot, TaskHistoryEntry } from '../types/taskHistory'

type ResultInsightsSource = ExcelInsightsResult | HistoryInsightsSnapshot | null

function mapInsights(
  result: ResultInsightsSource,
  aiStatus: AiInsightsStatus,
  aiError: string | null,
  aiLoadingMessage: string | null,
): Pick<ResultDashboardData, 'insights' | 'evidenceRegistry' | 'meta'> {
  return {
    insights: result?.insights || null,
    evidenceRegistry: result?.evidenceRegistry || {},
    meta: {
      aiStatus: result ? 'ready' : aiStatus,
      aiError,
      aiLoadingMessage,
      modelUsed: result?.modelUsed || null,
      fallbackUsed: result ? result.fallbackUsed : null,
    },
  }
}

export function createCurrentResultDashboardData(
  task: DemoTask,
  analysis: ResultDashboardData['analysis'],
  insights: ExcelInsightsResult | null,
  aiStatus: AiInsightsStatus,
  aiError: string | null,
  aiLoadingMessage: string,
): ResultDashboardData {
  return {
    mode: 'current',
    task: {
      taskId: task.id,
      title: task.title,
      fileName: task.fileName,
      createdAt: task.createdAt,
    },
    analysis,
    ...mapInsights(insights, aiStatus, aiError, aiLoadingMessage),
  }
}

export function createHistoryResultDashboardData(
  entry: TaskHistoryEntry,
): ResultDashboardData {
  return {
    mode: 'history',
    task: {
      taskId: entry.taskId,
      title: entry.title,
      fileName: entry.fileName,
      createdAt: entry.createdAt,
      completedAt: entry.completedAt,
    },
    analysis: entry.analysisSnapshot,
    ...mapInsights(
      entry.insightsSnapshot,
      entry.insightsSnapshot ? 'ready' : 'idle',
      null,
      null,
    ),
  }
}
