import type {
  CharacterStateAsset,
  CharacterStateAssets,
  PetVisualState,
} from '../types/character'

export const PET_VISUAL_STATES: readonly PetVisualState[] = [
  'idle',
  'walking',
  'thinking',
  'working',
  'waiting',
  'celebrating',
]

type CharacterWithStateAssets = {
  stateAssets?: CharacterStateAssets
}

export function isUsableStateAsset(
  asset: CharacterStateAsset | undefined,
  expectedState: PetVisualState,
) {
  return Boolean(
    asset
    && asset.state === expectedState
    && typeof asset.normalizedImage === 'string'
    && asset.normalizedImage.trim(),
  )
}

export function getCharacterStatePackProgress(character?: CharacterWithStateAssets) {
  const completedStates = PET_VISUAL_STATES.filter((state) => (
    isUsableStateAsset(character?.stateAssets?.[state], state)
  ))
  const missingStates = PET_VISUAL_STATES.filter((state) => !completedStates.includes(state))

  return {
    completedStates,
    missingStates,
    completedCount: completedStates.length,
    totalCount: PET_VISUAL_STATES.length,
    hasAnyStateAssets: completedStates.length > 0,
    isComplete: completedStates.length === PET_VISUAL_STATES.length,
  }
}

export function hasCompleteStatePack(character?: CharacterWithStateAssets) {
  return getCharacterStatePackProgress(character).isComplete
}
