import type { CharacterGenerationResult, CharacterVisualMetrics, PetVisualState } from './character'

export type PetState =
  | 'entering'
  | 'idle'
  | 'walking'
  | 'chatting'
  | 'thinking'
  | 'working'
  | 'sleeping'
  | 'waiting'
  | 'error'
  | 'celebrating'

export type TextMessage = {
  id: string
  role: 'user' | 'assistant'
  type: 'text'
  content: string
}

export type FileMessage = {
  id: string
  role: 'user'
  type: 'file'
  fileName: string
  fileType: string
  fileSize: string
}

export type Message = TextMessage | FileMessage

export type PetProfile = {
  name: string
  personality: string
  motionStyle: string
  sourcePhoto?: string
  characterResult?: CharacterGenerationResult
}

export type PetAppearanceImage = {
  imageSrc: string
  isNormalizedImage?: boolean
  assetState?: PetVisualState | 'master' | 'placeholder'
  assetId?: string
  visualMetrics?: CharacterVisualMetrics
}

export type PetAppearance = PetAppearanceImage & {
  fallbackImages?: PetAppearanceImage[]
  name: string
}

export type PetPosition = {
  x: number
  y: number
}

export type PetBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type MotionPreset = {
  idleDurationMs: number
  idleAmplitudePx: number
  walkDurationMs: number
  autoWalkDelayMs: number
}

export type PendingFileAttachment = {
  id: string
  fileId?: string
  name: string
  type: string
  size: number
  sizeLabel?: string
  receivedAt: string
  uploadedAt?: string
}
