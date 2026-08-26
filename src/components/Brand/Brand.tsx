import { Sparkles } from 'lucide-react'

type BrandProps = {
  compact?: boolean
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="TaskPet">
      <span className="brand__mark" aria-hidden="true">
        <Sparkles size={compact ? 18 : 22} strokeWidth={2.4} />
      </span>
      <span className="brand__name">TaskPet</span>
      {!compact && <span className="brand__tag">BETA</span>}
    </div>
  )
}
