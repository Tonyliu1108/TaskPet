import { PawPrint, Plus, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import type { Character } from '../../types/characterLibrary'
import { CharacterCard } from './CharacterCard'
import './CharacterLibraryPanel.css'

type DeletedCharacter = {
  character: Character
  wasActive: boolean
}

type CharacterLibraryPanelProps = {
  characters: Character[]
  activeCharacterId: string | null
  onSwitch: (characterId: string) => void
  onRename: (characterId: string, name: string) => void
  onDelete: (characterId: string) => void
  onRestore: (character: Character, makeActive?: boolean) => void
  onCreate: () => void
  onCompleteStatePack: (characterId: string) => void
  generatingWalkingCharacterId: string | null
  walkingGenerationErrors: Record<string, string>
  onGenerateWalking: (characterId: string) => void
}

export function CharacterLibraryPanel({
  characters,
  activeCharacterId,
  onSwitch,
  onRename,
  onDelete,
  onRestore,
  onCreate,
  onCompleteStatePack,
  generatingWalkingCharacterId,
  walkingGenerationErrors,
  onGenerateWalking,
}: CharacterLibraryPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [lastDeleted, setLastDeleted] = useState<DeletedCharacter | null>(null)

  const handleDelete = (character: Character, wasActive: boolean) => {
    onDelete(character.characterId)
    setLastDeleted({ character, wasActive })
  }

  const undoDelete = () => {
    if (!lastDeleted) return
    onRestore(lastDeleted.character, lastDeleted.wasActive)
    setLastDeleted(null)
  }

  return (
    <>
      <button
        className="character-library-trigger"
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <PawPrint size={15} />
        <span>我的桌宠</span>
        <b>{characters.length}</b>
      </button>

      {isOpen && (
        <section className="character-library-panel" aria-label="我的桌宠角色库">
          <header>
            <div>
              <span>CHARACTER LIBRARY</span>
              <h2>我的桌宠</h2>
              <p>切换只改变角色，当前聊天和任务会继续。</p>
            </div>
            <button type="button" aria-label="关闭角色库" onClick={() => setIsOpen(false)}><X size={17} /></button>
          </header>

          <div className="character-library-panel__grid">
            {characters.map((character) => (
              <CharacterCard
                key={character.characterId}
                character={character}
                isActive={character.characterId === activeCharacterId}
                onSwitch={onSwitch}
                onRename={onRename}
                onDelete={handleDelete}
                onCompleteStatePack={(characterId) => {
                  onSwitch(characterId)
                  setIsOpen(false)
                  onCompleteStatePack(characterId)
                }}
                isGeneratingWalking={generatingWalkingCharacterId === character.characterId}
                walkingGenerationError={walkingGenerationErrors[character.characterId]}
                onGenerateWalking={onGenerateWalking}
              />
            ))}
          </div>

          {characters.length === 0 && (
            <div className="character-library-panel__empty">
              <PawPrint size={25} />
              <strong>还没有已保存的桌宠</strong>
              <span>创建后会在这台浏览器长期保留。</span>
            </div>
          )}

          {lastDeleted && (
            <div className="character-library-panel__undo" role="status">
              <span>已从角色库删除“{lastDeleted.character.name}”</span>
              <button type="button" onClick={undoDelete}><RotateCcw size={13} />撤销</button>
            </div>
          )}

          <button
            className="character-library-panel__create"
            type="button"
            onClick={() => {
              setIsOpen(false)
              onCreate()
            }}
          >
            <Plus size={15} />创建新角色
          </button>
        </section>
      )}
    </>
  )
}
