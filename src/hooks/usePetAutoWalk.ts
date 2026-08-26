import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { MotionPreset, PetBounds, PetPosition, PetState } from '../types/pet'

type UsePetAutoWalkOptions = {
  petState: PetState
  isDragging: boolean
  disabled: boolean
  position: PetPosition
  setPosition: Dispatch<SetStateAction<PetPosition>>
  setPetState: Dispatch<SetStateAction<PetState>>
  setDirection: Dispatch<SetStateAction<1 | -1>>
  getBounds: () => PetBounds
  motionPreset: MotionPreset
}

export function usePetAutoWalk({
  petState,
  isDragging,
  disabled,
  position,
  setPosition,
  setPetState,
  setDirection,
  getBounds,
  motionPreset,
}: UsePetAutoWalkOptions) {
  const nextDirectionRef = useRef<-1 | 1>(-1)

  useEffect(() => {
    if (petState !== 'idle' || isDragging || disabled) return

    const startTimer = window.setTimeout(() => {
      const bounds = getBounds()
      const horizontalRange = Math.max(0, bounds.maxX - bounds.minX)
      const travelDistance = Math.min(210, Math.max(110, horizontalRange * 0.24))
      let direction = nextDirectionRef.current

      if (position.x - travelDistance < bounds.minX) direction = 1
      if (position.x + travelDistance > bounds.maxX) direction = -1

      const targetX = Math.min(
        Math.max(position.x + travelDistance * direction, bounds.minX),
        bounds.maxX,
      )

      nextDirectionRef.current = direction === 1 ? -1 : 1
      setDirection(direction)
      setPetState('walking')
      setPosition({ x: targetX, y: bounds.maxY })
    }, motionPreset.autoWalkDelayMs)

    return () => window.clearTimeout(startTimer)
  }, [
    disabled,
    getBounds,
    isDragging,
    motionPreset.autoWalkDelayMs,
    motionPreset.walkDurationMs,
    petState,
    position.x,
    setDirection,
    setPetState,
    setPosition,
  ])

  useEffect(() => {
    if (petState !== 'walking') return

    const completionTimer = window.setTimeout(() => {
      setPetState((current) => current === 'walking' ? 'idle' : current)
    }, motionPreset.walkDurationMs)

    return () => window.clearTimeout(completionTimer)
  }, [motionPreset.walkDurationMs, petState, setPetState])
}
