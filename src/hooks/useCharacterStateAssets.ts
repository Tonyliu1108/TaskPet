import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CharacterGenerationResult,
  CharacterSetupError,
  CharacterSetupErrorCode,
  CharacterStateAsset,
  CharacterStateAssets,
  CharacterStateAssetResponse,
  PetVisualState,
} from '../types/character'
import {
  getCharacterStatePackProgress,
  isUsableStateAsset,
  PET_VISUAL_STATES,
} from '../utils/characterStatePack'


const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
const STATE_REQUEST_TIMEOUT_MS = 240_000

export type StateAssetGenerationStatus = 'pending' | 'generating' | 'completed' | 'failed'

export type StateAssetGenerationItem = {
  status: StateAssetGenerationStatus
  error?: CharacterSetupError
}

export type StateAssetGenerationProgress = Record<PetVisualState, StateAssetGenerationItem>

type ErrorPayload = {
  detail?: {
    code?: string
    message?: string
    retryable?: boolean
  } | string
}

function createProgress(assets?: CharacterStateAssets): StateAssetGenerationProgress {
  return Object.fromEntries(PET_VISUAL_STATES.map((state) => [
    state,
    { status: isUsableStateAsset(assets?.[state], state) ? 'completed' : 'pending' },
  ])) as StateAssetGenerationProgress
}

function asSetupError(payload: ErrorPayload | null, status: number): CharacterSetupError {
  const detail = payload?.detail
  const detailObject = typeof detail === 'object' && detail ? detail : undefined
  return {
    code: (detailObject?.code || (status === 503 ? 'backend_unavailable' : 'generation_failed')) as CharacterSetupErrorCode,
    message: detailObject?.message
      || (typeof detail === 'string' ? detail : '状态角色生成失败，请重试此状态'),
    retryable: detailObject?.retryable ?? true,
  }
}

type UseCharacterStateAssetsOptions = {
  result?: CharacterGenerationResult
  onResultChange: (result: CharacterGenerationResult) => void
}

export function useCharacterStateAssets({
  result,
  onResultChange,
}: UseCharacterStateAssetsOptions) {
  const [progress, setProgress] = useState<StateAssetGenerationProgress>(() => (
    createProgress(result?.stateAssets)
  ))
  const [isGeneratingPack, setIsGeneratingPack] = useState(false)
  const assetsRef = useRef<CharacterStateAssets>({ ...result?.stateAssets })
  const resultRef = useRef(result)
  const onResultChangeRef = useRef(onResultChange)
  const activeRequestRef = useRef<AbortController | null>(null)

  useEffect(() => {
    activeRequestRef.current?.abort()
    resultRef.current = result
    assetsRef.current = { ...result?.stateAssets }
    setProgress(createProgress(result?.stateAssets))
    setIsGeneratingPack(false)
  }, [result?.characterId])

  useEffect(() => {
    onResultChangeRef.current = onResultChange
  }, [onResultChange])

  useEffect(() => () => activeRequestRef.current?.abort(), [])

  const persistAsset = useCallback((state: PetVisualState, asset: CharacterStateAsset) => {
    const currentResult = resultRef.current
    if (!currentResult) return
    assetsRef.current = { ...assetsRef.current, [state]: asset }
    const nextResult = {
      ...currentResult,
      stateAssets: assetsRef.current,
    }
    resultRef.current = nextResult
    onResultChangeRef.current(nextResult)
  }, [])

  const generateState = useCallback(async (state: PetVisualState) => {
    const currentResult = resultRef.current
    if (!currentResult?.normalizedImage) {
      setProgress((current) => ({
        ...current,
        [state]: {
          status: 'failed',
          error: {
            code: 'master_character_not_found',
            message: '当前角色缺少 normalizedImage，无法生成状态动作',
            retryable: false,
          },
        },
      }))
      return false
    }

    const controller = new AbortController()
    activeRequestRef.current = controller
    const timeout = window.setTimeout(() => controller.abort(), STATE_REQUEST_TIMEOUT_MS)
    setProgress((current) => ({
      ...current,
      [state]: { status: 'generating' },
    }))

    try {
      const response = await fetch(`${API_BASE_URL}/api/character/generate-state-asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: currentResult.characterId,
          state,
        }),
        signal: controller.signal,
      })
      const payload = await response.json().catch(() => null) as CharacterStateAssetResponse | ErrorPayload | null
      if (!response.ok || !payload || !('success' in payload) || payload.success !== true) {
        throw asSetupError(payload && 'detail' in payload ? payload : null, response.status)
      }

      persistAsset(state, payload.asset)
      setProgress((current) => ({
        ...current,
        [state]: { status: 'completed' },
      }))
      return true
    } catch (error) {
      let setupError: CharacterSetupError
      if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
        setupError = error as CharacterSetupError
      } else if (error instanceof DOMException && error.name === 'AbortError') {
        setupError = {
          code: 'request_timeout',
          message: '状态角色生成超时，请重试此状态',
          retryable: true,
        }
      } else {
        setupError = {
          code: 'network_failed',
          message: '无法连接状态角色生成服务，请确认 FastAPI 后端已启动',
          retryable: true,
        }
      }
      setProgress((current) => ({
        ...current,
        [state]: { status: 'failed', error: setupError },
      }))
      return false
    } finally {
      window.clearTimeout(timeout)
      if (activeRequestRef.current === controller) activeRequestRef.current = null
    }
  }, [persistAsset])

  const generateAll = useCallback(async () => {
    if (isGeneratingPack) return
    setIsGeneratingPack(true)
    try {
      for (const state of PET_VISUAL_STATES) {
        if (isUsableStateAsset(assetsRef.current[state], state)) continue
        await generateState(state)
      }
    } finally {
      setIsGeneratingPack(false)
    }
  }, [generateState, isGeneratingPack])

  const completedCount = getCharacterStatePackProgress({ stateAssets: assetsRef.current }).completedCount

  return {
    progress,
    completedCount,
    isGeneratingPack,
    generateAll,
    retryState: generateState,
  }
}
