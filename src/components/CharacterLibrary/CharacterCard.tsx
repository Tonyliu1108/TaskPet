import { Check, Pencil, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Character } from '../../types/characterLibrary'
import { getCharacterStatePackProgress } from '../../utils/characterStatePack'

type CharacterCardProps = {
  character: Character
  isActive: boolean
  onSwitch: (characterId: string) => void
  onRename: (characterId: string, name: string) => void
  onDelete: (character: Character, wasActive: boolean) => void
  onCompleteStatePack: (characterId: string) => void
  isGeneratingWalking: boolean
  walkingGenerationError?: string
  onGenerateWalking: (characterId: string) => void
}

export function CharacterCard({
  character,
  isActive,
  onSwitch,
  onRename,
  onDelete,
  onCompleteStatePack,
  isGeneratingWalking,
  walkingGenerationError,
  onGenerateWalking,
}: CharacterCardProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [draftName, setDraftName] = useState(character.name)
  const statePack = getCharacterStatePackProgress(character)
  const statePackKind = statePack.isComplete
    ? 'enhanced'
    : statePack.hasAnyStateAssets
      ? 'incomplete'
      : 'universal'
  const walkingMotion = character.motionAssets?.walking
  const hasRealWalking = walkingMotion?.status === 'completed' &&
    walkingMotion.frameCount > 0 && walkingMotion.frames.length === walkingMotion.frameCount
  const walkingLabel = isGeneratingWalking
    ? '真实行走生成中'
    : walkingGenerationError || walkingMotion?.status === 'error'
      ? '真实行走生成失败 · 重试'
      : hasRealWalking
        ? '真实行走'
        : '通用行走'

  useEffect(() => {
    if (!isRenaming) setDraftName(character.name)
  }, [character.name, isRenaming])

  const saveName = () => {
    const nextName = draftName.trim()
    if (!nextName) return
    onRename(character.characterId, nextName)
    setIsRenaming(false)
  }

  return (
    <article
      className={`character-library-card ${isActive ? 'character-library-card--active' : ''}`}
      data-character-id={character.characterId}
      data-character-active={isActive ? 'true' : 'false'}
      data-character-state-pack={statePackKind}
      data-character-state-pack-count={statePack.completedCount}
      data-character-walking={hasRealWalking ? 'real' : isGeneratingWalking ? 'generating' : 'universal'}
    >
      <div className="character-library-card__preview">
        <img src={character.normalizedImage} alt={`${character.name}的透明角色缩略图`} />
        {isActive && <span><Check size={11} />使用中</span>}
      </div>

      <div className="character-library-card__body">
        {isRenaming ? (
          <div className="character-library-card__rename">
            <input
              value={draftName}
              maxLength={12}
              aria-label="新的桌宠名字"
              autoFocus
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveName()
                if (event.key === 'Escape') setIsRenaming(false)
              }}
            />
            <button type="button" aria-label="保存名字" onClick={saveName}><Check size={13} /></button>
            <button type="button" aria-label="取消重命名" onClick={() => setIsRenaming(false)}><X size={13} /></button>
          </div>
        ) : (
          <div className="character-library-card__title">
            <strong>{character.name}</strong>
            <button type="button" aria-label={`重命名${character.name}`} onClick={() => setIsRenaming(true)}>
              <Pencil size={12} />
            </button>
          </div>
        )}

        <span className={statePack.hasAnyStateAssets ? `character-library-card__pack--${statePackKind}` : ''}>
          {statePack.hasAnyStateAssets
            ? `专属动作 ${statePack.completedCount}/${statePack.totalCount}`
            : '通用动作'}
        </span>
        <small>{character.personality} · {character.motionStyle}</small>
        <span className={`character-library-card__walking character-library-card__walking--${hasRealWalking ? 'real' : walkingGenerationError ? 'error' : 'universal'}`}>
          {walkingLabel}
        </span>
      </div>

      <div className="character-library-card__actions">
        <button
          className="character-library-card__use"
          type="button"
          disabled={isActive}
          onClick={() => onSwitch(character.characterId)}
        >
          {isActive ? '已使用' : '使用'}
        </button>
        {statePack.hasAnyStateAssets && !statePack.isComplete && (
          <button
            className="character-library-card__complete-pack"
            type="button"
            onClick={() => onCompleteStatePack(character.characterId)}
          >
            <Sparkles size={12} />补齐缺失状态
          </button>
        )}
        {!hasRealWalking && (
          <button
            className="character-library-card__generate-walking"
            type="button"
            disabled={isGeneratingWalking}
            title={walkingGenerationError}
            onClick={() => onGenerateWalking(character.characterId)}
          >
            <Sparkles size={12} />{isGeneratingWalking ? '生成中' : walkingGenerationError ? '重试行走' : '生成真实行走'}
          </button>
        )}
        <button
          className="character-library-card__delete"
          type="button"
          aria-label={`删除${character.name}`}
          onClick={() => setIsConfirmingDelete(true)}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {isConfirmingDelete && (
        <div className="character-library-card__confirmation" role="alert">
          <p>确定删除“{character.name}”吗？</p>
          <div>
            <button type="button" onClick={() => setIsConfirmingDelete(false)}>取消</button>
            <button type="button" onClick={() => onDelete(character, isActive)}>确定删除</button>
          </div>
        </div>
      )}
    </article>
  )
}
