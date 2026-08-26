import { useEffect, useMemo, useState } from 'react'
import { CharacterSetupPage } from './pages/CharacterSetupPage'
import { LoginPage } from './pages/LoginPage'
import { WorkspacePage } from './pages/WorkspacePage'
import { DEFAULT_PET_PROFILE } from './data/pet'
import { useCharacterLibrary } from './hooks/useCharacterLibrary'
import type { AppPage } from './types/app'
import type { PetProfile } from './types/pet'
import { characterToProfile } from './utils/characterMigration'

const PAGE_STORAGE_KEY = 'taskpet.demo.page'
const PROFILE_STORAGE_KEY = 'taskpet.demo.petProfile'
const SETUP_ORIGIN_STORAGE_KEY = 'taskpet.demo.characterSetupOrigin'
const CHARACTER_SETUP_SESSION_KEY = 'taskpet.demo.characterSetup'

type DemoSession = {
  page: AppPage
  profile: PetProfile
}

function isAppPage(value: string | null): value is AppPage {
  return value === 'login' || value === 'character-setup' || value === 'workspace'
}

function restoreDemoSession(): DemoSession {
  if (typeof window === 'undefined') {
    return { page: 'login', profile: DEFAULT_PET_PROFILE }
  }

  try {
    const storedPage = window.sessionStorage.getItem(PAGE_STORAGE_KEY)
    const storedProfile = window.sessionStorage.getItem(PROFILE_STORAGE_KEY)
    const page = isAppPage(storedPage) ? storedPage : 'login'

    if (!storedProfile) {
      return page === 'workspace'
        ? { page: 'login', profile: DEFAULT_PET_PROFILE }
        : { page, profile: DEFAULT_PET_PROFILE }
    }

    const parsedProfile = JSON.parse(storedProfile) as Partial<PetProfile>
    const hasValidProfile =
      typeof parsedProfile.name === 'string' &&
      typeof parsedProfile.personality === 'string' &&
      typeof parsedProfile.motionStyle === 'string'

    if (!hasValidProfile) {
      return page === 'workspace'
        ? { page: 'login', profile: DEFAULT_PET_PROFILE }
        : { page, profile: DEFAULT_PET_PROFILE }
    }

    return {
      page,
      profile: {
        name: parsedProfile.name!,
        personality: parsedProfile.personality!,
        motionStyle: parsedProfile.motionStyle!,
        sourcePhoto: typeof parsedProfile.sourcePhoto === 'string' ? parsedProfile.sourcePhoto : undefined,
        characterResult: parsedProfile.characterResult &&
          typeof parsedProfile.characterResult === 'object' &&
          typeof parsedProfile.characterResult.baseImage === 'string'
          ? parsedProfile.characterResult
          : undefined,
      },
    }
  } catch {
    return { page: 'login', profile: DEFAULT_PET_PROFILE }
  }
}

function DemoApp() {
  const restoredSession = useMemo(restoreDemoSession, [])
  const hadStoredPageAtBoot = useMemo(() => {
    if (typeof window === 'undefined') return false
    return isAppPage(window.sessionStorage.getItem(PAGE_STORAGE_KEY))
  }, [])
  const [page, setPage] = useState<AppPage>(restoredSession.page)
  const [petProfile, setPetProfile] = useState<PetProfile>(restoredSession.profile)
  const [setupOrigin, setSetupOrigin] = useState<'login' | 'workspace'>(() => {
    if (typeof window === 'undefined') return 'login'
    return window.sessionStorage.getItem(SETUP_ORIGIN_STORAGE_KEY) === 'workspace'
      ? 'workspace'
      : 'login'
  })
  const {
    library,
    activeCharacter,
    addCharacter,
    switchCharacter,
    renameCharacter,
    deleteCharacter,
    restoreCharacter,
    updateCharacterResult,
    updateCharacterMotionAssets,
  } = useCharacterLibrary(restoredSession.profile)
  const effectiveProfile = useMemo(() => activeCharacter
    ? characterToProfile(activeCharacter)
    : DEFAULT_PET_PROFILE, [activeCharacter])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(PAGE_STORAGE_KEY, page)
      window.sessionStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(petProfile))
    } catch {
      // Storage can be unavailable in restricted browsing contexts; the Demo still works in memory.
    }
  }, [page, petProfile])

  useEffect(() => {
    setPetProfile(effectiveProfile)
  }, [effectiveProfile])

  useEffect(() => {
    if (!hadStoredPageAtBoot && activeCharacter) {
      setPage('workspace')
    }
  }, [activeCharacter, hadStoredPageAtBoot])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(SETUP_ORIGIN_STORAGE_KEY, setupOrigin)
    } catch {
      // The current in-memory navigation origin is enough for this tab.
    }
  }, [setupOrigin])

  const openCharacterSetup = (origin: 'login' | 'workspace') => {
    setSetupOrigin(origin)
    if (origin === 'workspace') {
      try {
        window.sessionStorage.removeItem(CHARACTER_SETUP_SESSION_KEY)
      } catch {
        // A fresh in-memory setup page still opens if storage is restricted.
      }
    }
    setPage('character-setup')
  }

  if (page === 'character-setup') {
    return (
      <CharacterSetupPage
        onBack={() => setPage(setupOrigin)}
        onContinue={(profile) => {
          addCharacter(profile)
          setPetProfile(profile)
          setPage('workspace')
        }}
      />
    )
  }

  if (page === 'workspace') {
    return (
      <WorkspacePage
        profile={effectiveProfile}
        characters={library.characters}
        activeCharacterId={library.activeCharacterId}
        onSwitchCharacter={switchCharacter}
        onRenameCharacter={renameCharacter}
        onDeleteCharacter={deleteCharacter}
        onRestoreCharacter={restoreCharacter}
        onCreateCharacter={() => openCharacterSetup('workspace')}
        onCharacterMotionChange={updateCharacterMotionAssets}
        onProfileChange={(profile) => {
          setPetProfile(profile)
          if (activeCharacter && profile.characterResult) {
            updateCharacterResult(activeCharacter.characterId, profile.characterResult)
          }
        }}
      />
    )
  }

  return <LoginPage onContinue={() => openCharacterSetup('login')} />
}

function App() {
  return <DemoApp />
}

export default App
