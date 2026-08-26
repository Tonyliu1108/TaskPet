import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from 'react'
import type { PetBounds, PetPosition } from '../types/pet'

type UsePetDragOptions = {
  elementRef: RefObject<HTMLElement>
  getBounds: () => PetBounds
  setPosition: Dispatch<SetStateAction<PetPosition>>
  onPointerIntent: () => void
  onDragDetected?: () => void
}

type DragSession = {
  pointerId: number
  startPointerX: number
  startPointerY: number
  startPetX: number
  startPetY: number
  hasMoved: boolean
}

const DRAG_THRESHOLD_PX = 6

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function usePetDrag({
  elementRef,
  getBounds,
  setPosition,
  onPointerIntent,
  onDragDetected,
}: UsePetDragOptions) {
  const sessionRef = useRef<DragSession | null>(null)
  const suppressClickRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return

    const element = elementRef.current
    if (!element) return

    const rect = element.getBoundingClientRect()
    setPosition({ x: rect.left, y: rect.top })
    onPointerIntent()
    suppressClickRef.current = false
    sessionRef.current = {
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startPetX: rect.left,
      startPetY: rect.top,
      hasMoved: false,
    }
    element.setPointerCapture(event.pointerId)
  }, [elementRef, onPointerIntent, setPosition])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const session = sessionRef.current
    if (!session || session.pointerId !== event.pointerId) return

    const deltaX = event.clientX - session.startPointerX
    const deltaY = event.clientY - session.startPointerY
    const distance = Math.hypot(deltaX, deltaY)

    if (!session.hasMoved && distance < DRAG_THRESHOLD_PX) return

    if (!session.hasMoved) {
      session.hasMoved = true
      setIsDragging(true)
      onDragDetected?.()
    }

    const bounds = getBounds()
    setPosition({
      x: clamp(session.startPetX + deltaX, bounds.minX, bounds.maxX),
      y: clamp(session.startPetY + deltaY, bounds.minY, bounds.maxY),
    })
  }, [getBounds, onDragDetected, setPosition])

  const finishPointer = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const session = sessionRef.current
    if (!session || session.pointerId !== event.pointerId) return

    suppressClickRef.current = session.hasMoved
    sessionRef.current = null
    setIsDragging(false)

    if (elementRef.current?.hasPointerCapture(event.pointerId)) {
      elementRef.current.releasePointerCapture(event.pointerId)
    }
  }, [elementRef])

  const shouldSuppressClick = useCallback(() => {
    const shouldSuppress = suppressClickRef.current
    suppressClickRef.current = false
    return shouldSuppress
  }, [])

  return {
    isDragging,
    shouldSuppressClick,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointer,
      onPointerCancel: finishPointer,
    },
  }
}
