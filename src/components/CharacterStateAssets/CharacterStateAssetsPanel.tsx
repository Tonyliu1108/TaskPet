import {
  CheckCircle2,
  Circle,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useCharacterStateAssets } from '../../hooks/useCharacterStateAssets'
import type {
  CharacterGenerationResult,
  PetVisualState,
} from '../../types/character'
import { PET_VISUAL_STATES } from '../../utils/characterStatePack'
import './CharacterStateAssetsPanel.css'


const STATE_LABELS: Record<PetVisualState, string> = {
  idle: '待命 idle',
  walking: '行走 walking',
  thinking: '思考 thinking',
  working: '工作 working',
  waiting: '等待 waiting',
  celebrating: '庆祝 celebrating',
}

type CharacterStateAssetsPanelProps = {
  result: CharacterGenerationResult
  onResultChange: (result: CharacterGenerationResult) => void
  openRequestToken?: number
}

export function CharacterStateAssetsPanel({
  result,
  onResultChange,
  openRequestToken = 0,
}: CharacterStateAssetsPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const {
    progress,
    completedCount,
    isGeneratingPack,
    generateAll,
    retryState,
  } = useCharacterStateAssets({ result, onResultChange })
  const isAnyGenerating = PET_VISUAL_STATES.some((state) => progress[state].status === 'generating')

  useEffect(() => {
    if (openRequestToken > 0) setIsOpen(true)
  }, [openRequestToken])

  return (
    <>
      <button
        className="state-assets-trigger"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
      >
        <Sparkles size={15} />
        <span>{completedCount === 6 ? '专属动作包 6/6' : `专属动作 ${completedCount}/6`}</span>
      </button>

      {isOpen && (
        <section className="state-assets-panel" aria-label="桌宠状态动作生成">
          <header>
            <div>
              <span>MASTER CHARACTER</span>
              <h2>可选专属动作包</h2>
              <p>普通角色已可使用全部通用 Motion；仅在你确认后才生成 6 张专属姿势。</p>
            </div>
            <button type="button" aria-label="关闭状态动作面板" onClick={() => setIsOpen(false)}>
              <X size={17} />
            </button>
          </header>

          <div className="state-assets-panel__progress">
            <strong>{completedCount} / 6</strong>
            <span>已完成状态</span>
            <i><b style={{ width: `${(completedCount / 6) * 100}%` }} /></i>
          </div>

          <ul className="state-assets-list">
            {PET_VISUAL_STATES.map((state) => {
              const item = progress[state]
              const asset = result.stateAssets?.[state]
              return (
                <li key={state} data-state-asset={state} data-generation-status={item.status}>
                  <span className={`state-assets-list__icon state-assets-list__icon--${item.status}`}>
                    {item.status === 'completed' && <CheckCircle2 size={17} />}
                    {item.status === 'generating' && <LoaderCircle size={17} />}
                    {(item.status === 'pending' || item.status === 'failed') && <Circle size={17} />}
                  </span>
                  <div>
                    <strong>{STATE_LABELS[state]}</strong>
                    {item.status === 'generating' && <small>正在调用 Seedream 并执行透明化…</small>}
                    {item.status === 'pending' && <small>等待生成</small>}
                    {item.status === 'failed' && <small className="state-assets-list__error">{item.error?.message}</small>}
                    {asset && (
                      <small title={asset.assetId}>
                        HTTP {asset.providerHttpStatus} · {(asset.durationMs / 1000).toFixed(1)} 秒 · {asset.assetId.slice(-10)}
                      </small>
                    )}
                  </div>
                  {(item.status === 'failed' || item.status === 'completed') && (
                    <button
                      type="button"
                      onClick={() => retryState(state)}
                      disabled={isAnyGenerating}
                    >
                      <RefreshCw size={13} />{item.status === 'failed' ? '重试' : '重新生成'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          {completedCount < 6 ? (
            <button
              className="state-assets-panel__generate"
              type="button"
              onClick={generateAll}
              disabled={isAnyGenerating || isGeneratingPack}
            >
              {isGeneratingPack ? <LoaderCircle size={16} /> : <Sparkles size={16} />}
              {isGeneratingPack ? `正在补齐桌宠动作 ${completedCount + 1} / 6` : '补齐缺失状态'}
            </button>
          ) : (
            <p className="state-assets-panel__complete"><CheckCircle2 size={15} />专属动作包已完成并保存到角色库</p>
          )}
        </section>
      )}
    </>
  )
}
