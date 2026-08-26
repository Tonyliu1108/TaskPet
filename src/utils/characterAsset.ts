import type {
  CharacterGenerationResult,
  PetVisualState,
} from '../types/character'
import type { PetState } from '../types/pet'

const VISUAL_STATES = new Set<PetState>([
  'idle',
  'walking',
  'thinking',
  'working',
  'waiting',
  'celebrating',
])

export type ResolvedCharacterImage = {
  imageSrc: string
  isNormalizedImage: boolean
  assetState: PetVisualState | 'master' | 'placeholder'
  assetId?: string
  visualMetrics?: CharacterGenerationResult['visualMetrics']
  fallbackImages?: ResolvedCharacterImageCandidate[]
}

export type ResolvedCharacterImageCandidate = Omit<ResolvedCharacterImage, 'fallbackImages'>

export function getPreferredCharacterImage(result?: CharacterGenerationResult) {
  return result?.normalizedImage
    || result?.transparentImage
    || result?.baseImage
    || ''
}

export function getCharacterAssetLabel(result: CharacterGenerationResult) {
  if (result.normalizedImage) return '透明标准角色 · 768×768'
  if (result.transparentImage) return '透明角色 PNG'
  return '原始卡通主形象'
}

export function getCharacterImageForPetState(
  result: CharacterGenerationResult | undefined,
  petState: PetState,
): ResolvedCharacterImage {
  if (!result) {
    return {
      imageSrc: '',
      isNormalizedImage: false,
      assetState: 'placeholder',
    }
  }

  const requestedState = VISUAL_STATES.has(petState)
    ? petState as PetVisualState
    : undefined
  const candidates: ResolvedCharacterImageCandidate[] = []
  const addCandidate = (candidate: ResolvedCharacterImageCandidate) => {
    if (!candidate.imageSrc || candidates.some((item) => item.imageSrc === candidate.imageSrc)) return
    candidates.push(candidate)
  }
  const requestedAsset = requestedState ? result.stateAssets?.[requestedState] : undefined
  if (requestedAsset?.normalizedImage) addCandidate({
    imageSrc: requestedAsset.normalizedImage,
    isNormalizedImage: true,
    assetState: requestedAsset.state,
    assetId: requestedAsset.assetId,
    visualMetrics: requestedAsset.visualMetrics,
  })
  const idleAsset = result.stateAssets?.idle
  if (idleAsset?.normalizedImage) addCandidate({
    imageSrc: idleAsset.normalizedImage,
    isNormalizedImage: true,
    assetState: 'idle',
    assetId: idleAsset.assetId,
    visualMetrics: idleAsset.visualMetrics,
  })
  if (result.normalizedImage) addCandidate({
    imageSrc: result.normalizedImage,
    isNormalizedImage: true,
    assetState: 'master',
    visualMetrics: result.visualMetrics,
  })
  if (result.transparentImage) addCandidate({
    imageSrc: result.transparentImage,
    isNormalizedImage: false,
    assetState: 'master',
  })
  if (result.baseImage) addCandidate({
    imageSrc: result.baseImage,
    isNormalizedImage: false,
    assetState: 'master',
  })

  const [primary, ...fallbackImages] = candidates
  if (!primary) {
    return {
      imageSrc: '',
      isNormalizedImage: false,
      assetState: 'placeholder',
    }
  }

  return { ...primary, fallbackImages }
}
