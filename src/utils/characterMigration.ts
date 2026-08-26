import type {
  CharacterGenerationResult,
  CharacterMotionAssets,
  CharacterMotionFrame,
  CharacterStateAsset,
  CharacterStateAssets,
  CharacterVisualMetrics,
  PetVisualState,
  WalkingMotionAsset,
} from '../types/character'
import type { Character, CharacterLibrary } from '../types/characterLibrary'
import type { PetProfile } from '../types/pet'

const VISUAL_STATES: PetVisualState[] = [
  'idle',
  'walking',
  'thinking',
  'working',
  'waiting',
  'celebrating',
]

function isHttpAsset(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//.test(value)
}

function toIsoString(value: unknown, fallback = new Date().toISOString()) {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function normalizeVisualMetrics(value: unknown): CharacterVisualMetrics | undefined {
  if (!value || typeof value !== 'object') return undefined
  const metrics = value as Partial<CharacterVisualMetrics>
  const validRange = (range: unknown): range is [number, number] => (
    Array.isArray(range) && range.length === 2 &&
    range.every((item) => typeof item === 'number' && Number.isFinite(item))
  )
  if (
    typeof metrics.sourceWidth !== 'number' || metrics.sourceWidth <= 0 ||
    typeof metrics.sourceHeight !== 'number' || metrics.sourceHeight <= 0 ||
    typeof metrics.subjectHeightRatio !== 'number' || metrics.subjectHeightRatio <= 0 ||
    typeof metrics.baselineRatio !== 'number' || metrics.baselineRatio < 0 ||
    metrics.measurement !== 'alpha-bbox-v1' ||
    typeof metrics.alphaThreshold !== 'number'
  ) return undefined

  const alphaBBox = metrics.alphaBBox &&
    ['left', 'top', 'right', 'bottom'].every((key) => (
      typeof metrics.alphaBBox?.[key as keyof typeof metrics.alphaBBox] === 'number'
    ))
    ? { ...metrics.alphaBBox }
    : undefined
  const aggregation = metrics.aggregation === 'median' ? 'median' : 'single'
  return {
    sourceWidth: metrics.sourceWidth,
    sourceHeight: metrics.sourceHeight,
    subjectHeightRatio: metrics.subjectHeightRatio,
    baselineRatio: metrics.baselineRatio,
    measurement: 'alpha-bbox-v1',
    alphaThreshold: metrics.alphaThreshold,
    alphaBBox,
    aggregation,
    sampleCount: typeof metrics.sampleCount === 'number' && metrics.sampleCount > 0
      ? metrics.sampleCount
      : undefined,
    subjectHeightRatioRange: validRange(metrics.subjectHeightRatioRange)
      ? [...metrics.subjectHeightRatioRange]
      : undefined,
    baselineRatioRange: validRange(metrics.baselineRatioRange)
      ? [...metrics.baselineRatioRange]
      : undefined,
  }
}

function normalizeStateAsset(value: unknown, expectedState: PetVisualState): CharacterStateAsset | undefined {
  if (!value || typeof value !== 'object') return undefined
  const asset = value as Partial<CharacterStateAsset>
  if (
    typeof asset.assetId !== 'string' ||
    asset.state !== expectedState ||
    !isHttpAsset(asset.baseImage) ||
    !isHttpAsset(asset.transparentImage) ||
    !isHttpAsset(asset.normalizedImage)
  ) return undefined

  return {
    assetId: asset.assetId,
    state: expectedState,
    baseImage: asset.baseImage,
    transparentImage: asset.transparentImage,
    normalizedImage: asset.normalizedImage,
    modelName: typeof asset.modelName === 'string' ? asset.modelName : '',
    promptVersion: typeof asset.promptVersion === 'string' ? asset.promptVersion : '',
    createdAt: toIsoString(asset.createdAt),
    providerHttpStatus: typeof asset.providerHttpStatus === 'number' ? asset.providerHttpStatus : 200,
    durationMs: typeof asset.durationMs === 'number' ? asset.durationMs : 0,
    visualMetrics: normalizeVisualMetrics(asset.visualMetrics),
  }
}

function normalizeStateAssets(value: unknown): CharacterStateAssets | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const entries = VISUAL_STATES.flatMap((state) => {
    const asset = normalizeStateAsset(record[state], state)
    return asset ? [[state, asset] as const] : []
  })
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function normalizeMotionFrame(value: unknown, expectedIndex: number): CharacterMotionFrame | null {
  if (!value || typeof value !== 'object') return null
  const frame = value as Partial<CharacterMotionFrame>
  if (
    frame.frameIndex !== expectedIndex ||
    !isHttpAsset(frame.imageUrl) ||
    (frame.format !== 'png' && frame.format !== 'webp') ||
    typeof frame.width !== 'number' || frame.width <= 0 ||
    typeof frame.height !== 'number' || frame.height <= 0
  ) return null
  return {
    frameIndex: expectedIndex,
    sourceFrameIndex: typeof frame.sourceFrameIndex === 'number' ? frame.sourceFrameIndex : undefined,
    imageUrl: frame.imageUrl,
    format: frame.format,
    width: frame.width,
    height: frame.height,
    visualMetrics: normalizeVisualMetrics(frame.visualMetrics),
  }
}

function normalizeWalkingMotion(value: unknown): WalkingMotionAsset | undefined {
  if (!value || typeof value !== 'object') return undefined
  const motion = value as Partial<WalkingMotionAsset>
  const source = motion.source
  if (!source || typeof source !== 'object' || !Array.isArray(motion.frames)) return undefined
  const frames = motion.frames.map((frame, index) => normalizeMotionFrame(frame, index))
  if (frames.some((frame) => frame === null)) return undefined
  const normalizedFrames = frames as CharacterMotionFrame[]
  const validStatus = ['not_started', 'generating', 'processing', 'partial', 'completed', 'error']
    .includes(String(motion.status))
  if (
    !validStatus ||
    typeof motion.version !== 'string' ||
    typeof motion.frameCount !== 'number' ||
    motion.frameCount !== normalizedFrames.length ||
    typeof motion.playbackFps !== 'number' || motion.playbackFps <= 0 ||
    typeof motion.frameDurationMs !== 'number' || motion.frameDurationMs <= 0 ||
    typeof source.provider !== 'string' ||
    typeof source.modelName !== 'string' ||
    !isHttpAsset(source.sourceVideoUrl) ||
    typeof source.sourceVideoDurationSec !== 'number' ||
    typeof source.sourceVideoFps !== 'number' ||
    typeof source.sourceVideoWidth !== 'number' ||
    typeof source.sourceVideoHeight !== 'number'
  ) return undefined
  return {
    version: motion.version,
    status: motion.status as WalkingMotionAsset['status'],
    frames: normalizedFrames,
    frameCount: motion.frameCount,
    playbackFps: motion.playbackFps,
    frameDurationMs: motion.frameDurationMs,
    source: {
      provider: source.provider,
      modelName: source.modelName,
      modelId: typeof source.modelId === 'string' ? source.modelId : undefined,
      sourceVideoUrl: source.sourceVideoUrl,
      sourceVideoDurationSec: source.sourceVideoDurationSec,
      sourceVideoFps: source.sourceVideoFps,
      sourceVideoWidth: source.sourceVideoWidth,
      sourceVideoHeight: source.sourceVideoHeight,
      cycleStartFrame: typeof source.cycleStartFrame === 'number' ? source.cycleStartFrame : undefined,
      cycleEndFrame: typeof source.cycleEndFrame === 'number' ? source.cycleEndFrame : undefined,
      taskId: typeof source.taskId === 'string' ? source.taskId : undefined,
      callIndex: typeof source.callIndex === 'number' ? source.callIndex : undefined,
    },
    promptVersion: typeof motion.promptVersion === 'string' ? motion.promptVersion : undefined,
    errorMessage: typeof motion.errorMessage === 'string' ? motion.errorMessage : undefined,
    createdAt: toIsoString(motion.createdAt),
    updatedAt: toIsoString(motion.updatedAt),
    visualMetrics: normalizeVisualMetrics(motion.visualMetrics),
  }
}

function normalizeMotionAssets(value: unknown): CharacterMotionAssets | undefined {
  if (!value || typeof value !== 'object') return undefined
  const walking = normalizeWalkingMotion((value as CharacterMotionAssets).walking)
  return walking ? { walking } : undefined
}

export function characterFromProfile(profile: PetProfile): Character | null {
  const result = profile.characterResult
  if (
    !result ||
    typeof result.characterId !== 'string' ||
    !result.characterId ||
    !isHttpAsset(result.normalizedImage)
  ) return null

  const createdAt = toIsoString(result.createdAt)
  return {
    characterId: result.characterId,
    name: profile.name.trim() || '未命名桌宠',
    sourceImage: isHttpAsset(result.sourceImage) ? result.sourceImage : undefined,
    baseImage: isHttpAsset(result.baseImage) ? result.baseImage : undefined,
    transparentImage: isHttpAsset(result.transparentImage) ? result.transparentImage : undefined,
    normalizedImage: result.normalizedImage,
    personality: profile.personality,
    motionStyle: profile.motionStyle,
    stateAssets: normalizeStateAssets(result.stateAssets),
    motionAssets: normalizeMotionAssets(result.motionAssets),
    visualMetrics: normalizeVisualMetrics(result.visualMetrics),
    modelName: result.modelName,
    promptVersion: result.promptVersion,
    createdAt,
    updatedAt: createdAt,
  }
}

export function characterToGenerationResult(character: Character): CharacterGenerationResult {
  return {
    characterId: character.characterId,
    sourceImage: character.sourceImage || '',
    croppedPersonImage: '',
    baseImage: character.baseImage || character.normalizedImage,
    transparentImage: character.transparentImage,
    normalizedImage: character.normalizedImage,
    modelName: character.modelName,
    promptVersion: character.promptVersion,
    createdAt: character.createdAt,
    stateAssets: character.stateAssets,
    motionAssets: character.motionAssets,
    visualMetrics: character.visualMetrics,
  }
}

export function characterToProfile(character: Character): PetProfile {
  return {
    name: character.name,
    personality: character.personality,
    motionStyle: character.motionStyle,
    sourcePhoto: character.sourceImage,
    characterResult: characterToGenerationResult(character),
  }
}

export function updateCharacterFromResult(
  character: Character,
  result: CharacterGenerationResult,
): Character {
  return {
    ...character,
    sourceImage: isHttpAsset(result.sourceImage) ? result.sourceImage : character.sourceImage,
    baseImage: isHttpAsset(result.baseImage) ? result.baseImage : character.baseImage,
    transparentImage: isHttpAsset(result.transparentImage)
      ? result.transparentImage
      : character.transparentImage,
    normalizedImage: isHttpAsset(result.normalizedImage)
      ? result.normalizedImage
      : character.normalizedImage,
    stateAssets: normalizeStateAssets(result.stateAssets),
    motionAssets: normalizeMotionAssets(result.motionAssets) || character.motionAssets,
    visualMetrics: normalizeVisualMetrics(result.visualMetrics) || character.visualMetrics,
    modelName: result.modelName || character.modelName,
    promptVersion: result.promptVersion || character.promptVersion,
    updatedAt: new Date().toISOString(),
  }
}

export function normalizeCharacter(value: unknown): Character | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<Character>
  if (
    typeof item.characterId !== 'string' ||
    !item.characterId ||
    typeof item.name !== 'string' ||
    !isHttpAsset(item.normalizedImage) ||
    typeof item.personality !== 'string' ||
    typeof item.motionStyle !== 'string'
  ) return null

  return {
    characterId: item.characterId,
    name: item.name.trim() || '未命名桌宠',
    sourceImage: isHttpAsset(item.sourceImage) ? item.sourceImage : undefined,
    baseImage: isHttpAsset(item.baseImage) ? item.baseImage : undefined,
    transparentImage: isHttpAsset(item.transparentImage) ? item.transparentImage : undefined,
    normalizedImage: item.normalizedImage,
    personality: item.personality,
    motionStyle: item.motionStyle,
    stateAssets: normalizeStateAssets(item.stateAssets),
    motionAssets: normalizeMotionAssets(item.motionAssets),
    visualMetrics: normalizeVisualMetrics(item.visualMetrics),
    modelName: typeof item.modelName === 'string' ? item.modelName : undefined,
    promptVersion: typeof item.promptVersion === 'string' ? item.promptVersion : undefined,
    createdAt: toIsoString(item.createdAt),
    updatedAt: item.updatedAt ? toIsoString(item.updatedAt) : undefined,
  }
}

export function normalizeCharacterLibrary(value: unknown): CharacterLibrary | null {
  if (!value || typeof value !== 'object') return null
  const parsed = value as Partial<CharacterLibrary>
  if (!Array.isArray(parsed.characters)) return null

  const characters = parsed.characters
    .map(normalizeCharacter)
    .filter((character): character is Character => character !== null)
  const deduplicated = characters.filter((character, index) => (
    characters.findIndex((item) => item.characterId === character.characterId) === index
  ))
  const activeCharacterId = typeof parsed.activeCharacterId === 'string' &&
    deduplicated.some((character) => character.characterId === parsed.activeCharacterId)
    ? parsed.activeCharacterId
    : deduplicated[0]?.characterId ?? null

  return {
    activeCharacterId,
    characters: deduplicated,
    recoveredB2MigrationCompleted: parsed.recoveredB2MigrationCompleted === true,
  }
}

export function mergeLegacyCharacter(
  library: CharacterLibrary,
  legacyProfile: PetProfile,
): CharacterLibrary {
  const legacy = characterFromProfile(legacyProfile)
  if (!legacy) return library

  const existingIndex = library.characters.findIndex((item) => item.characterId === legacy.characterId)
  if (existingIndex < 0) {
    return {
      activeCharacterId: library.activeCharacterId || legacy.characterId,
      characters: [legacy, ...library.characters],
    }
  }

  const existing = library.characters[existingIndex]
  const merged: Character = {
    ...legacy,
    ...existing,
    stateAssets: {
      ...legacy.stateAssets,
      ...existing.stateAssets,
    },
    motionAssets: existing.motionAssets || legacy.motionAssets,
  }
  return {
    ...library,
    characters: library.characters.map((item, index) => index === existingIndex ? merged : item),
  }
}
