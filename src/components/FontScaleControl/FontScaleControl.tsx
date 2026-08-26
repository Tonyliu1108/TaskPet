import { useEffect, useState } from 'react'
import './FontScaleControl.css'

export const FONT_SCALE_STORAGE_KEY = 'taskpet.ui.fontScale'

const OPTIONS = [
  { value: '0.9', label: '小', detail: '90%' },
  { value: '1', label: '标准', detail: '100%' },
  { value: '1.15', label: '大', detail: '115%' },
  { value: '1.3', label: '特大', detail: '130%' },
] as const

type FontScale = typeof OPTIONS[number]['value']

function restoreFontScale(): FontScale {
  if (typeof window === 'undefined') return '1'
  try {
    const stored = window.localStorage.getItem(FONT_SCALE_STORAGE_KEY)
    return OPTIONS.some((option) => option.value === stored) ? stored as FontScale : '1'
  } catch {
    return '1'
  }
}

export function FontScaleControl() {
  const [isOpen, setIsOpen] = useState(false)
  const [fontScale, setFontScale] = useState<FontScale>(restoreFontScale)

  useEffect(() => {
    document.documentElement.dataset.fontScale = fontScale
    document.documentElement.style.setProperty('--ui-font-scale', fontScale)
    try {
      window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, fontScale)
    } catch {
      // The active choice still applies when localStorage is restricted.
    }
  }, [fontScale])

  const activeOption = OPTIONS.find((option) => option.value === fontScale) || OPTIONS[1]

  return (
    <div className="font-scale-control">
      <button
        className="font-scale-control__trigger"
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title={`显示字号：${activeOption.label}`}
        onClick={() => setIsOpen((current) => !current)}
      >
        <b aria-hidden="true">Aa</b><span>显示</span>
      </button>
      {isOpen && (
        <div className="font-scale-control__menu" role="menu" aria-label="字体大小">
          <strong>字体大小</strong>
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={fontScale === option.value}
              data-active={fontScale === option.value}
              onClick={() => {
                setFontScale(option.value)
                setIsOpen(false)
              }}
            >
              <span>{option.label}</span><small>{option.detail}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
