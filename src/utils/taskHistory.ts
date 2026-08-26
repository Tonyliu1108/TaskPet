import type {
  BusinessInsights,
  ExcelAnalysisResult,
  ExcelInsightsResult,
  InsightEvidence,
} from '../types/excel'
import type { DemoTask } from '../types/task'
import type {
  HistoryInsightsSnapshot,
  TaskHistoryEntry,
  TaskHistoryState,
} from '../types/taskHistory'

export const TASK_HISTORY_STORAGE_KEY = 'taskpet.taskHistory'
export const TASK_HISTORY_STORAGE_VERSION = 1 as const
export const TASK_HISTORY_LIMIT = 20

const EMPTY_HISTORY: TaskHistoryState = {
  version: TASK_HISTORY_STORAGE_VERSION,
  entries: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isRankedSales(value: unknown) {
  return isRecord(value) &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.sales) &&
    (value.share === null || isFiniteNumber(value.share)) &&
    isFiniteNumber(value.rank)
}

function isSheetCandidate(value: unknown) {
  return isRecord(value) &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.headerRow) &&
    isFiniteNumber(value.rows) &&
    isFiniteNumber(value.columns) &&
    isFiniteNumber(value.nonEmptyRows) &&
    isFiniteNumber(value.density) &&
    isStringArray(value.matchedFields) &&
    isFiniteNumber(value.score)
}

function isInsightItem(value: unknown) {
  return isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.observation === 'string' &&
    typeof value.interpretation === 'string' &&
    Array.isArray(value.evidenceRefs) &&
    value.evidenceRefs.every((ref) => typeof ref === 'string')
}

function isBusinessInsights(value: unknown): value is BusinessInsights {
  if (!isRecord(value) || !isRecord(value.executiveSummary)) return false
  const summary = value.executiveSummary
  if (
    typeof summary.summary !== 'string' ||
    !Array.isArray(summary.evidenceRefs) ||
    !summary.evidenceRefs.every((ref) => typeof ref === 'string')
  ) return false

  const insightGroups = [
    value.trendInsights,
    value.regionInsights,
    value.productInsights,
    value.dataQualityNotes,
  ]
  if (!insightGroups.every((group) => Array.isArray(group) && group.every(isInsightItem))) {
    return false
  }

  if (!Array.isArray(value.risks) || !value.risks.every((risk) => (
    isRecord(risk) &&
    typeof risk.title === 'string' &&
    (risk.severity === 'low' || risk.severity === 'medium' || risk.severity === 'high') &&
    typeof risk.description === 'string' &&
    Array.isArray(risk.evidenceRefs) &&
    risk.evidenceRefs.every((ref) => typeof ref === 'string')
  ))) return false

  return Array.isArray(value.recommendations) && value.recommendations.every((item) => (
    isRecord(item) &&
    typeof item.title === 'string' &&
    (item.priority === 'P0' || item.priority === 'P1' || item.priority === 'P2') &&
    typeof item.action === 'string' &&
    typeof item.rationale === 'string' &&
    Array.isArray(item.evidenceRefs) &&
    item.evidenceRefs.every((ref) => typeof ref === 'string')
  ))
}

function isEvidenceRegistry(value: unknown): value is Record<string, InsightEvidence> {
  if (!isRecord(value)) return false
  return Object.values(value).every((item) => (
    isRecord(item) &&
    typeof item.label === 'string' &&
    (typeof item.value === 'string' || typeof item.value === 'number' || item.value === null) &&
    ['CNY', 'ratio', 'count', 'text', 'unavailable'].includes(String(item.unit))
  ))
}

function isAnalysisSnapshot(value: unknown): value is ExcelAnalysisResult {
  if (!isRecord(value)) return false
  const { workbook, dataset, fieldMapping, dataQuality, metrics } = value
  if (
    typeof value.analysisId !== 'string' ||
    typeof value.fileId !== 'string' ||
    typeof value.fileName !== 'string' ||
    !isRecord(workbook) ||
    !isFiniteNumber(workbook.sheetCount) ||
    !Array.isArray(workbook.sheets) ||
    !workbook.sheets.every(isSheetCandidate) ||
    typeof workbook.selectedSheet !== 'string' ||
    !['requested', 'single_valid_sheet', 'scored'].includes(String(workbook.selectionMethod)) ||
    !isRecord(dataset) ||
    typeof dataset.sheetName !== 'string' ||
    !isFiniteNumber(dataset.headerRow) ||
    !isFiniteNumber(dataset.rawRowCount) ||
    !isFiniteNumber(dataset.cleanRowCount) ||
    !isFiniteNumber(dataset.columnCount) ||
    !isStringArray(dataset.columns) ||
    !(dataset.dateRange === null || (
      isRecord(dataset.dateRange) &&
      typeof dataset.dateRange.start === 'string' &&
      typeof dataset.dateRange.end === 'string'
    )) ||
    !isRecord(fieldMapping) ||
    !Object.values(fieldMapping).every((item) => (
      isRecord(item) &&
      typeof item.column === 'string' &&
      isFiniteNumber(item.confidence) &&
      typeof item.match === 'string'
    )) ||
    !isRecord(dataQuality) ||
    ![
      dataQuality.rawRowCount,
      dataQuality.cleanRowCount,
      dataQuality.emptyRowsRemoved,
      dataQuality.duplicateRows,
      dataQuality.duplicateRowsRemoved,
      dataQuality.missingCells,
      dataQuality.invalidSalesRows,
      dataQuality.invalidDateRows,
    ].every(isFiniteNumber) ||
    !isRecord(dataQuality.missingByColumn) ||
    !Object.values(dataQuality.missingByColumn).every(isFiniteNumber) ||
    !isStringArray(dataQuality.warnings) ||
    !isRecord(metrics) ||
    !isRecord(metrics.sales) ||
    ![
      metrics.sales.totalSales,
      metrics.sales.averageSales,
      metrics.sales.medianSales,
      metrics.sales.minSales,
      metrics.sales.maxSales,
      metrics.sales.validSalesRowCount,
    ].every(isFiniteNumber) ||
    !(metrics.sales.yoyGrowth === null || isFiniteNumber(metrics.sales.yoyGrowth)) ||
    !(metrics.topRegion === null || isRankedSales(metrics.topRegion)) ||
    !(metrics.topProduct === null || isRankedSales(metrics.topProduct)) ||
    !(metrics.quantity === null || (
      isRecord(metrics.quantity) &&
      isFiniteNumber(metrics.quantity.totalQuantity) &&
      isFiniteNumber(metrics.quantity.validQuantityRowCount)
    )) ||
    !Array.isArray(value.monthlyTrend) ||
    !value.monthlyTrend.every((item) => (
      isRecord(item) &&
      typeof item.month === 'string' &&
      isFiniteNumber(item.sales) &&
      isFiniteNumber(item.validRowCount)
    )) ||
    !Array.isArray(value.regionalSales) ||
    !value.regionalSales.every(isRankedSales) ||
    !Array.isArray(value.productSales) ||
    !value.productSales.every(isRankedSales) ||
    !isStringArray(value.warnings) ||
    typeof value.summary !== 'string'
  ) return false

  return true
}

function isInsightsSnapshot(value: unknown): value is HistoryInsightsSnapshot {
  if (!isRecord(value)) return false
  return value.validationVersion === 1 &&
    typeof value.insightId === 'string' &&
    typeof value.fileId === 'string' &&
    typeof value.analysisId === 'string' &&
    typeof value.modelUsed === 'string' &&
    typeof value.fallbackUsed === 'boolean' &&
    typeof value.latencyMs === 'number' &&
    isBusinessInsights(value.insights) &&
    isEvidenceRegistry(value.evidenceRegistry) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === 'string')
}

function normalizeHistoryEntry(value: unknown): TaskHistoryEntry | null {
  if (!isRecord(value)) return null
  if (
    value.version !== TASK_HISTORY_STORAGE_VERSION ||
    typeof value.taskId !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.fileId !== 'string' ||
    typeof value.fileName !== 'string' ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.completedAt) ||
    value.status !== 'completed' ||
    !isAnalysisSnapshot(value.analysisSnapshot) ||
    (value.insightsSnapshot !== null && !isInsightsSnapshot(value.insightsSnapshot))
  ) return null

  return value as TaskHistoryEntry
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function snapshotInsights(result: ExcelInsightsResult | null): HistoryInsightsSnapshot | null {
  if (!result) return null
  const {
    insightId,
    fileId,
    analysisId,
    modelUsed,
    fallbackUsed,
    latencyMs,
    validationVersion,
    insights,
    evidenceRegistry,
    warnings,
  } = result
  return cloneJson({
    insightId,
    fileId,
    analysisId,
    modelUsed,
    fallbackUsed,
    latencyMs,
    validationVersion,
    insights,
    evidenceRegistry,
    warnings,
  })
}

export function createTaskHistoryEntry(
  task: DemoTask,
  analysis: ExcelAnalysisResult,
  insights: ExcelInsightsResult | null,
  completedAt = new Date().toISOString(),
): TaskHistoryEntry {
  return {
    version: TASK_HISTORY_STORAGE_VERSION,
    taskId: task.id,
    title: task.title || `分析 ${task.fileName}`,
    fileId: task.taskFileId,
    fileName: task.fileName,
    createdAt: task.createdAt,
    completedAt,
    status: 'completed',
    analysisSnapshot: cloneJson(analysis),
    insightsSnapshot: snapshotInsights(insights),
  }
}

export function sortAndLimitTaskHistory(entries: TaskHistoryEntry[]) {
  return [...entries]
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt))
    .filter((entry, index, sorted) => (
      sorted.findIndex((candidate) => candidate.taskId === entry.taskId) === index
    ))
    .slice(0, TASK_HISTORY_LIMIT)
}

export function upsertTaskHistory(
  entries: TaskHistoryEntry[],
  incoming: TaskHistoryEntry,
) {
  return sortAndLimitTaskHistory([
    incoming,
    ...entries.filter((entry) => entry.taskId !== incoming.taskId),
  ])
}

export function restoreTaskHistoryState(): TaskHistoryState {
  if (typeof window === 'undefined') return EMPTY_HISTORY
  try {
    const stored = window.localStorage.getItem(TASK_HISTORY_STORAGE_KEY)
    if (!stored) return EMPTY_HISTORY
    const parsed = JSON.parse(stored) as unknown
    if (!isRecord(parsed) || parsed.version !== TASK_HISTORY_STORAGE_VERSION || !Array.isArray(parsed.entries)) {
      return EMPTY_HISTORY
    }
    return {
      version: TASK_HISTORY_STORAGE_VERSION,
      entries: sortAndLimitTaskHistory(
        parsed.entries
          .map(normalizeHistoryEntry)
          .filter((entry): entry is TaskHistoryEntry => entry !== null),
      ),
    }
  } catch {
    return EMPTY_HISTORY
  }
}

export function persistTaskHistory(entries: TaskHistoryEntry[]) {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(TASK_HISTORY_STORAGE_KEY, serializeTaskHistory(entries))
    return true
  } catch {
    return false
  }
}

export function serializeTaskHistory(entries: TaskHistoryEntry[]) {
  return JSON.stringify({
    version: TASK_HISTORY_STORAGE_VERSION,
    entries: sortAndLimitTaskHistory(entries),
  })
}

export function getTaskHistoryStorageSize(entries: TaskHistoryEntry[]) {
  return new TextEncoder().encode(serializeTaskHistory(entries)).byteLength
}
