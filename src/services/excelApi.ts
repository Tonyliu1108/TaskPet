import type {
  ExcelAnalysisResult,
  ExcelApiErrorDetail,
  ExcelInsightsResult,
  UploadedExcelFile,
} from '../types/excel'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')

export class ExcelApiError extends Error {
  code: string
  detail: ExcelApiErrorDetail

  constructor(detail: ExcelApiErrorDetail) {
    super(detail.message)
    this.name = 'ExcelApiError'
    this.code = detail.code
    this.detail = detail
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as { detail?: ExcelApiErrorDetail } | T | null
  if (!response.ok) {
    const detail = payload && typeof payload === 'object' && 'detail' in payload && payload.detail
      ? payload.detail
      : { code: 'ANALYSIS_FAILED', message: '请求失败，请稍后重试。' }
    throw new ExcelApiError(detail)
  }
  return payload as T
}

export async function uploadExcelFile(file: File): Promise<UploadedExcelFile> {
  const formData = new FormData()
  formData.append('file', file, file.name)
  const response = await fetch(`${API_BASE_URL}/api/files/upload`, {
    method: 'POST',
    body: formData,
  })
  return readResponse<UploadedExcelFile>(response)
}

export async function analyzeExcelFile(
  fileId: string,
  sheetName: string | null = null,
): Promise<ExcelAnalysisResult> {
  const response = await fetch(`${API_BASE_URL}/api/excel/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, sheetName }),
  })
  return readResponse<ExcelAnalysisResult>(response)
}

export async function generateExcelInsights(
  fileId: string,
  analysisId: string,
): Promise<ExcelInsightsResult> {
  const response = await fetch(`${API_BASE_URL}/api/excel/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, analysisId }),
  })
  return readResponse<ExcelInsightsResult>(response)
}
