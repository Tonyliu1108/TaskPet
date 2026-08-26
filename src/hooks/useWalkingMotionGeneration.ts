import { useCallback, useState } from 'react'
import type { CharacterMotionAssets, WalkingMotionAsset } from '../types/character'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')

type GenerateWalkingResponse = {
  success: true
  characterId: string
  motion: WalkingMotionAsset
}

export function useWalkingMotionGeneration(
  onMotionChange: (characterId: string, motionAssets: CharacterMotionAssets) => void,
) {
  const [generatingCharacterId, setGeneratingCharacterId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const generateWalkingMotion = useCallback(async (characterId: string) => {
    if (generatingCharacterId) return
    setGeneratingCharacterId(characterId)
    setErrors((current) => ({ ...current, [characterId]: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/api/character/generate-walking-motion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId }),
      })
      const payload = await response.json().catch(() => null) as GenerateWalkingResponse | {
        detail?: { message?: string }
      } | null
      if (!response.ok || !payload || !('success' in payload)) {
        const message = payload && 'detail' in payload
          ? payload.detail?.message
          : undefined
        throw new Error(message || `真实行走生成失败（HTTP ${response.status}）`)
      }
      onMotionChange(characterId, { walking: payload.motion })
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [characterId]: error instanceof Error ? error.message : '真实行走生成失败，请重试',
      }))
    } finally {
      setGeneratingCharacterId(null)
    }
  }, [generatingCharacterId, onMotionChange])

  return { generatingCharacterId, errors, generateWalkingMotion }
}
