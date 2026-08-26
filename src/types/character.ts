export type CharacterSetupStage =
  | 'idle'
  | 'detecting'
  | 'multiple_detected'
  | 'ready_to_generate'
  | 'generating'
  | 'generated'
  | 'error'

export type CharacterSetupErrorCode =
  | 'invalid_file'
  | 'no_person'
  | 'detection_failed'
  | 'backend_unavailable'
  | 'generation_failed'
  | 'base_image_download_failed'
  | 'transparent_asset_failed'
  | 'normalization_failed'
  | 'asset_write_failed'
  | 'master_character_not_found'
  | 'master_character_invalid'
  | 'invalid_pet_state'
  | 'network_failed'
  | 'request_timeout'

export interface CharacterSetupError {
  code: CharacterSetupErrorCode
  message: string
  retryable: boolean
}

export interface DetectedPersonBox {
  id: string
  x: number
  y: number
  width: number
  height: number
  score: number
}

export type PetVisualState =
  | 'idle'
  | 'walking'
  | 'thinking'
  | 'working'
  | 'waiting'
  | 'celebrating'

export type AlphaBoundingBox = {
  left: number
  top: number
  right: number
  bottom: number
}

export type CharacterVisualMetrics = {
  sourceWidth: number
  sourceHeight: number
  subjectHeightRatio: number
  baselineRatio: number
  measurement: 'alpha-bbox-v1'
  alphaThreshold: number
  alphaBBox?: AlphaBoundingBox
  aggregation?: 'single' | 'median'
  sampleCount?: number
  subjectHeightRatioRange?: [number, number]
  baselineRatioRange?: [number, number]
}

export interface CharacterStateAsset {
  assetId: string
  state: PetVisualState
  baseImage: string
  transparentImage: string
  normalizedImage: string
  modelName: string
  promptVersion: string
  createdAt: string
  providerHttpStatus: number
  durationMs: number
  visualMetrics?: CharacterVisualMetrics
}

export type CharacterStateAssets = Partial<Record<PetVisualState, CharacterStateAsset>>

export type CharacterMotionFrame = {
  frameIndex: number
  sourceFrameIndex?: number
  imageUrl: string
  format: 'png' | 'webp'
  width: number
  height: number
  visualMetrics?: CharacterVisualMetrics
}

export type WalkingSourceMetadata = {
  provider: string
  modelName: string
  modelId?: string
  sourceVideoUrl: string
  sourceVideoDurationSec: number
  sourceVideoFps: number
  sourceVideoWidth: number
  sourceVideoHeight: number
  cycleStartFrame?: number
  cycleEndFrame?: number
  taskId?: string
  callIndex?: number
}

export type WalkingMotionAsset = {
  version: string
  status: 'not_started' | 'generating' | 'processing' | 'partial' | 'completed' | 'error'
  frames: CharacterMotionFrame[]
  frameCount: number
  playbackFps: number
  frameDurationMs: number
  source: WalkingSourceMetadata
  promptVersion?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
  visualMetrics?: CharacterVisualMetrics
}

export type CharacterMotionAssets = {
  walking?: WalkingMotionAsset
}

export interface CharacterGenerationResult {
  characterId: string
  sourceImage: string
  croppedPersonImage: string
  baseImage: string
  transparentImage?: string
  normalizedImage?: string
  modelName?: string
  promptVersion?: string
  createdAt: string | number
  stateAssets?: CharacterStateAssets
  motionAssets?: CharacterMotionAssets
  visualMetrics?: CharacterVisualMetrics
}

export interface CharacterSetupSession {
  stage: CharacterSetupStage
  fileName: string
  sourcePhoto?: string
  people: DetectedPersonBox[]
  selectedPersonId?: string
  croppedPersonImage?: string
  result?: CharacterGenerationResult
  error?: CharacterSetupError
  petName: string
  personality: string
  motionStyle: string
}

export interface CharacterGenerationRequest {
  imageBase64: string
  petName: string
  personality: string
  motionStyle: string
}

export interface CharacterGenerationResponse {
  success: true
  characterId: string
  baseImage: string
  transparentImage: string
  normalizedImage: string
  modelName: string
  promptVersion: string
  createdAt: string
}

export interface CharacterStateAssetRequest {
  characterId: string
  state: PetVisualState
}

export interface CharacterStateAssetResponse {
  success: true
  characterId: string
  masterImage: string
  asset: CharacterStateAsset
}
