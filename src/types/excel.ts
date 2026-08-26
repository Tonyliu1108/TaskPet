export type UploadedExcelFile = {
  fileId: string
  fileName: string
  size: number
  extension: '.xlsx'
  uploadedAt: string
}

export type SheetCandidate = {
  name: string
  headerRow: number
  rows: number
  columns: number
  nonEmptyRows: number
  density: number
  matchedFields: string[]
  score: number
}

export type RankedSales = {
  name: string
  sales: number
  share: number | null
  rank: number
}

export type ExcelAnalysisResult = {
  analysisId: string
  fileId: string
  fileName: string
  workbook: {
    sheetCount: number
    sheets: SheetCandidate[]
    selectedSheet: string
    selectionMethod: 'requested' | 'single_valid_sheet' | 'scored'
  }
  dataset: {
    sheetName: string
    headerRow: number
    rawRowCount: number
    cleanRowCount: number
    columnCount: number
    columns: string[]
    dateRange: { start: string; end: string } | null
  }
  fieldMapping: Record<string, { column: string; confidence: number; match: string }>
  dataQuality: {
    rawRowCount: number
    cleanRowCount: number
    emptyRowsRemoved: number
    duplicateRows: number
    duplicateRowsRemoved: number
    missingCells: number
    missingByColumn: Record<string, number>
    invalidSalesRows: number
    invalidDateRows: number
    warnings: string[]
  }
  metrics: {
    sales: {
      totalSales: number
      averageSales: number
      medianSales: number
      minSales: number
      maxSales: number
      validSalesRowCount: number
      yoyGrowth: number | null
    }
    topRegion: RankedSales | null
    topProduct: RankedSales | null
    quantity: { totalQuantity: number; validQuantityRowCount: number } | null
  }
  monthlyTrend: Array<{ month: string; sales: number; validRowCount: number }>
  regionalSales: RankedSales[]
  productSales: RankedSales[]
  warnings: string[]
  summary: string
}

export type ExcelApiErrorDetail = {
  code: string
  message: string
  needsSheetSelection?: boolean
  candidates?: SheetCandidate[]
  [key: string]: unknown
}

export type ExcelAnalysisStatus = 'idle' | 'uploading' | 'uploaded' | 'analyzing' | 'ready' | 'error'

export type InsightEvidence = { label: string; value: string | number | null; unit: 'CNY' | 'ratio' | 'count' | 'text' | 'unavailable' }
export type EvidenceRefsItem = { title: string; observation: string; interpretation: string; evidenceRefs: string[] }
export type BusinessInsights = {
  executiveSummary: { summary: string; evidenceRefs: string[] }
  trendInsights: EvidenceRefsItem[]
  regionInsights: EvidenceRefsItem[]
  productInsights: EvidenceRefsItem[]
  dataQualityNotes: EvidenceRefsItem[]
  risks: Array<{ title: string; severity: 'low' | 'medium' | 'high'; description: string; evidenceRefs: string[] }>
  recommendations: Array<{ title: string; priority: 'P0' | 'P1' | 'P2'; action: string; rationale: string; evidenceRefs: string[] }>
}
export type ExcelInsightsResult = {
  insightId: string
  fileId: string
  analysisId: string
  modelUsed: string
  fallbackUsed: boolean
  latencyMs: number
  diagnostics?: {
    contextBuildMs: number
    primary: { model: string; attempts: InsightAttemptDiagnostic[] }
    repair: { attempted: boolean; latencyMs: number | null; failureReason: string | null }
    fallback: { triggered: boolean; reason: string | null }
    fallbackRequest: { model: string; attempts: InsightAttemptDiagnostic[] } | null
    totalLatencyMs: number
  }
  validationVersion: 1
  insights: BusinessInsights
  evidenceRegistry: Record<string, InsightEvidence>
  warnings: string[]
}
export type InsightAttemptDiagnostic = {
  model: string
  attempt: 'initial' | 'repair'
  upstreamHttpStatus: number | null
  upstreamLatencyMs: number | null
  validation: {
    jsonParseMs: number | null
    schemaValidationMs: number | null
    evidenceValidationMs: number | null
    success: boolean
    failureReason: string | null
  } | null
  failureReason: string | null
}
export type AiInsightsStatus = 'idle' | 'analyzing' | 'ready' | 'error'
