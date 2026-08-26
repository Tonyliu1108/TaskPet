import { CheckCircle2, RefreshCw, Replace } from 'lucide-react'
import type { CharacterGenerationResult } from '../../types/character'
import { getCharacterAssetLabel, getPreferredCharacterImage } from '../../utils/characterAsset'

type CharacterPreviewProps = {
  result: CharacterGenerationResult
  onUse: () => void
  onRegenerate: () => void
  onReplace: () => void
  isGenerating: boolean
}

export function CharacterPreview({
  result,
  onUse,
  onRegenerate,
  onReplace,
  isGenerating,
}: CharacterPreviewProps) {
  const previewImage = getPreferredCharacterImage(result)

  return (
    <section className="character-preview" aria-labelledby="character-preview-title">
      <header>
        <span><CheckCircle2 size={16} />透明角色已就绪</span>
        <h2 id="character-preview-title">你的标准桌宠形象已准备好</h2>
        <p>{result.modelName || '豆包 Seedream'} · {getCharacterAssetLabel(result)}</p>
      </header>
      <div className="character-preview__images">
        <figure>
          <img src={result.croppedPersonImage} alt="选中的人物裁剪区域" />
          <figcaption>选中人物</figcaption>
        </figure>
        <figure className="character-preview__result">
          <img src={previewImage} alt="透明标准化卡通全身桌宠形象" />
          <figcaption>透明标准角色</figcaption>
        </figure>
      </div>
      <div className="character-preview__actions">
        <button className="primary-button" type="button" onClick={onUse}>
          <CheckCircle2 size={17} />使用这个形象
        </button>
        <button className="secondary-button" type="button" onClick={onRegenerate} disabled={isGenerating}>
          <RefreshCw size={16} />重新生成
        </button>
        <button className="secondary-button" type="button" onClick={onReplace}>
          <Replace size={16} />更换照片
        </button>
      </div>
    </section>
  )
}
