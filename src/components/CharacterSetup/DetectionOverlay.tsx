import { Check } from 'lucide-react'
import type { DetectedPersonBox } from '../../types/character'

type DetectionOverlayProps = {
  sourcePhoto: string
  people: DetectedPersonBox[]
  selectedPersonId?: string
  onSelect: (person: DetectedPersonBox) => void
}

export function DetectionOverlay({
  sourcePhoto,
  people,
  selectedPersonId,
  onSelect,
}: DetectionOverlayProps) {
  return (
    <div className="detection-stage" aria-label="人物识别结果">
      <div className="detection-stage__image-shell">
        <img src={sourcePhoto} alt="已上传的待识别照片" />
        {people.map((person, index) => {
          const selected = person.id === selectedPersonId
          return (
            <button
              key={person.id}
              type="button"
              className={`person-box ${selected ? 'person-box--selected' : ''}`}
              style={{
                left: `${person.x * 100}%`,
                top: `${person.y * 100}%`,
                width: `${person.width * 100}%`,
                height: `${person.height * 100}%`,
              }}
              onClick={() => onSelect(person)}
              aria-label={`选择人物 ${index + 1}，识别置信度 ${Math.round(person.score * 100)}%`}
              aria-pressed={selected}
              data-person-id={person.id}
            >
              <span>{selected ? <Check size={13} /> : index + 1}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
