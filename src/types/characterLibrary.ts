import type { CharacterMotionAssets, CharacterStateAssets, CharacterVisualMetrics } from './character'

export interface Character {
  characterId: string
  name: string
  sourceImage?: string
  baseImage?: string
  transparentImage?: string
  normalizedImage: string
  personality: string
  motionStyle: string
  stateAssets?: CharacterStateAssets
  motionAssets?: CharacterMotionAssets
  visualMetrics?: CharacterVisualMetrics
  modelName?: string
  promptVersion?: string
  createdAt: string
  updatedAt?: string
}

export interface CharacterLibrary {
  activeCharacterId: string | null
  characters: Character[]
  recoveredB2MigrationCompleted?: boolean
}
