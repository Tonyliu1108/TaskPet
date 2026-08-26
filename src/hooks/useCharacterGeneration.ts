import { useCallback, useRef, useState } from 'react'
import type {
  CharacterGenerationRequest,
  CharacterGenerationResponse,
  CharacterSetupError,
  CharacterSetupErrorCode,
} from '../types/character'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
// Seedream generation is followed by rembg inference and normalization on the
// backend, so leave enough room for the first model warm-up without hanging.
const REQUEST_TIMEOUT_MS = 180_000

type ErrorPayload = {
  detail?: {
    code?: string
    message?: string
    retryable?: boolean
  } | string
}

const SERVER_ERROR_CODES = new Set<CharacterSetupErrorCode>([
  'base_image_download_failed',
  'transparent_asset_failed',
  'normalization_failed',
  'asset_write_failed',
])

function getSetupErrorCode(code: string | undefined, status: number): CharacterSetupErrorCode {
  if (code && SERVER_ERROR_CODES.has(code as CharacterSetupErrorCode)) {
    return code as CharacterSetupErrorCode
  }
  return status === 503 ? 'backend_unavailable' : 'generation_failed'
}

export class CharacterGenerationClientError extends Error {
  readonly setupError: CharacterSetupError

  constructor(setupError: CharacterSetupError) {
    super(setupError.message)
    this.setupError = setupError
  }
}

export function useCharacterGeneration() {
  const [isGenerating, setIsGenerating] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const generateCharacter = useCallback(async (request: CharacterGenerationRequest) => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    setIsGenerating(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/character/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      const payload = await response.json().catch(() => null) as CharacterGenerationResponse | ErrorPayload | null
      if (!response.ok || !payload || !('success' in payload) || payload.success !== true) {
        const detail = payload && 'detail' in payload ? payload.detail : undefined
        const detailObject = typeof detail === 'object' && detail ? detail : undefined
        throw new CharacterGenerationClientError({
          code: getSetupErrorCode(detailObject?.code, response.status),
          message: detailObject?.message || (typeof detail === 'string' ? detail : '卡通形象生成失败，请稍后重试'),
          retryable: detailObject?.retryable ?? true,
        })
      }
      return payload
    } catch (error) {
      if (error instanceof CharacterGenerationClientError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new CharacterGenerationClientError({
          code: 'request_timeout',
          message: '生成请求超时，请检查网络后重试',
          retryable: true,
        })
      }
      throw new CharacterGenerationClientError({
        code: 'network_failed',
        message: '无法连接角色生成服务，请确认 FastAPI 后端已启动',
        retryable: true,
      })
    } finally {
      window.clearTimeout(timeout)
      if (abortControllerRef.current === controller) abortControllerRef.current = null
      setIsGenerating(false)
    }
  }, [])

  return { generateCharacter, isGenerating }
}
