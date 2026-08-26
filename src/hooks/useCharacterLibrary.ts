import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CharacterGenerationResult, CharacterMotionAssets } from '../types/character'
import type { Character, CharacterLibrary } from '../types/characterLibrary'
import type { PetProfile } from '../types/pet'
import {
  characterFromProfile,
  mergeLegacyCharacter,
  normalizeCharacterLibrary,
  updateCharacterFromResult,
} from '../utils/characterMigration'

export const CHARACTER_LIBRARY_STORAGE_KEY = 'taskpet.characterLibrary'

function restoreLibrary(legacyProfile: PetProfile): CharacterLibrary {
  const emptyLibrary: CharacterLibrary = { activeCharacterId: null, characters: [] }
  if (typeof window === 'undefined') return emptyLibrary

  try {
    const stored = window.localStorage.getItem(CHARACTER_LIBRARY_STORAGE_KEY)
    const normalized = stored ? normalizeCharacterLibrary(JSON.parse(stored)) : null
    if (normalized) {
      return mergeLegacyCharacter(normalized, legacyProfile)
    }
  } catch {
    // Fall through to the legacy PetProfile migration.
  }

  const migrated = characterFromProfile(legacyProfile)
  return migrated
    ? { activeCharacterId: migrated.characterId, characters: [migrated] }
    : emptyLibrary
}

export function useCharacterLibrary(legacyProfile: PetProfile) {
  const [library, setLibrary] = useState<CharacterLibrary>(() => restoreLibrary(legacyProfile))

  useEffect(() => {
    try {
      window.localStorage.setItem(CHARACTER_LIBRARY_STORAGE_KEY, JSON.stringify(library))
    } catch {
      // The Character Library still works in memory when persistent storage is unavailable.
    }
  }, [library])

  const activeCharacter = useMemo(() => (
    library.characters.find((character) => character.characterId === library.activeCharacterId) ?? null
  ), [library])

  const addCharacter = useCallback((profile: PetProfile) => {
    const character = characterFromProfile(profile)
    if (!character) return null

    setLibrary((current) => ({
      ...current,
      activeCharacterId: character.characterId,
      characters: current.characters.some((item) => item.characterId === character.characterId)
        ? current.characters.map((item) => item.characterId === character.characterId ? character : item)
        : [...current.characters, character],
    }))
    return character
  }, [])

  const switchCharacter = useCallback((characterId: string) => {
    setLibrary((current) => current.characters.some((item) => item.characterId === characterId)
      ? { ...current, activeCharacterId: characterId }
      : current)
  }, [])

  const renameCharacter = useCallback((characterId: string, name: string) => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    setLibrary((current) => ({
      ...current,
      characters: current.characters.map((character) => character.characterId === characterId
        ? { ...character, name: trimmedName, updatedAt: new Date().toISOString() }
        : character),
    }))
  }, [])

  const deleteCharacter = useCallback((characterId: string) => {
    setLibrary((current) => {
      const remaining = current.characters.filter((character) => character.characterId !== characterId)
      return {
        ...current,
        characters: remaining,
        activeCharacterId: current.activeCharacterId === characterId
          ? remaining[0]?.characterId ?? null
          : current.activeCharacterId,
      }
    })
  }, [])

  const restoreCharacter = useCallback((character: Character, makeActive = false) => {
    setLibrary((current) => ({
      ...current,
      characters: current.characters.some((item) => item.characterId === character.characterId)
        ? current.characters
        : [...current.characters, character],
      activeCharacterId: makeActive ? character.characterId : current.activeCharacterId,
    }))
  }, [])

  const updateCharacterResult = useCallback((
    characterId: string,
    result: CharacterGenerationResult,
  ) => {
    setLibrary((current) => ({
      ...current,
      characters: current.characters.map((character) => character.characterId === characterId
        ? updateCharacterFromResult(character, result)
        : character),
    }))
  }, [])

  const updateCharacterMotionAssets = useCallback((
    characterId: string,
    motionAssets: CharacterMotionAssets,
  ) => {
    setLibrary((current) => ({
      ...current,
      characters: current.characters.map((character) => character.characterId === characterId
        ? { ...character, motionAssets, updatedAt: new Date().toISOString() }
        : character),
    }))
  }, [])

  return {
    library,
    activeCharacter,
    addCharacter,
    switchCharacter,
    renameCharacter,
    deleteCharacter,
    restoreCharacter,
    updateCharacterResult,
    updateCharacterMotionAssets,
  }
}
