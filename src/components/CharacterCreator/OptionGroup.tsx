import { Check } from 'lucide-react'
import type { CharacterOption } from '../../types/app'

type OptionGroupProps = {
  legend: string
  name: string
  options: CharacterOption[]
  value: string
  onChange: (value: string) => void
}

export function OptionGroup({ legend, name, options, value, onChange }: OptionGroupProps) {
  return (
    <fieldset className="option-group">
      <legend>{legend}</legend>
      <div className="option-grid">
        {options.map((option) => {
          const selected = option.id === value

          return (
            <label className={`option-card ${selected ? 'option-card--selected' : ''}`} key={option.id}>
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={selected}
                onChange={() => onChange(option.id)}
              />
              <span className="option-card__copy">
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
              <span className="option-card__check" aria-hidden="true">
                {selected && <Check size={13} strokeWidth={3} />}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
