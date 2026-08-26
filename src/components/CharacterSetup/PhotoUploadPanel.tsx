import { ImagePlus, ScanSearch, UploadCloud } from 'lucide-react'
import type { ChangeEvent } from 'react'
import type { CharacterSetupStage, DetectedPersonBox } from '../../types/character'
import { DetectionOverlay } from './DetectionOverlay'

type PhotoUploadPanelProps = {
  stage: CharacterSetupStage
  fileName: string
  sourcePhoto?: string
  people: DetectedPersonBox[]
  selectedPersonId?: string
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSelectPerson: (person: DetectedPersonBox) => void
}

export function PhotoUploadPanel({
  stage,
  fileName,
  sourcePhoto,
  people,
  selectedPersonId,
  onFileChange,
  onSelectPerson,
}: PhotoUploadPanelProps) {
  if (sourcePhoto) {
    return (
      <div className="photo-detection-card">
        <DetectionOverlay
          sourcePhoto={sourcePhoto}
          people={people}
          selectedPersonId={selectedPersonId}
          onSelect={onSelectPerson}
        />
        <div className="photo-detection-card__footer">
          <span>{fileName}</span>
          <label htmlFor="pet-photo">更换照片</label>
        </div>
        <input
          className="visually-hidden-input"
          id="pet-photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFileChange}
        />
      </div>
    )
  }

  return (
    <label className="upload-card" htmlFor="pet-photo">
      <input
        id="pet-photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFileChange}
      />
      <span className="upload-card__visual" aria-hidden="true">
        {stage === 'detecting' ? <ScanSearch size={30} /> : fileName ? <ImagePlus size={30} /> : <UploadCloud size={30} />}
      </span>
      <span className="upload-card__title">上传一张包含你的照片</span>
      <span className="upload-card__hint">普通生活照也可以，正面或半身效果更好 · JPG / PNG / WebP</span>
      <span className="upload-card__button">选择照片</span>
    </label>
  )
}
