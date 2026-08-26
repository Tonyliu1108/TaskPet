import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { PetPosition } from '../types/pet'
import type { FileDragSource } from '../types/workspace'

type UseFileDragOptions = {
  onDragStateChange: (isDragging: boolean) => void
  onDragMove: (point: PetPosition) => void
  onDrop: (point: PetPosition, source: FileDragSource) => void
  resetToken: unknown
}

type FileDragSession = {
  pointerId: number
  startX: number
  startY: number
  hasMoved: boolean
  sourceElement: HTMLElement
  dragSource: FileDragSource
}

const FILE_DRAG_THRESHOLD_PX = 5

export function useFileDrag({
  onDragStateChange,
  onDragMove,
  onDrop,
  resetToken,
}: UseFileDragOptions) {
  const sessionRef = useRef<FileDragSession | null>(null)
  const isDraggingRef = useRef(false)
  const suppressClickRef = useRef(false)
  const callbacksRef = useRef({ onDragStateChange, onDragMove, onDrop })
  const [isDragging, setIsDragging] = useState(false)
  const [dragPosition, setDragPosition] = useState<PetPosition | null>(null)
  const [dragSource, setDragSource] = useState<FileDragSource | null>(null)

  useEffect(() => {
    callbacksRef.current = { onDragStateChange, onDragMove, onDrop }
  }, [onDragMove, onDragStateChange, onDrop])

  const cancelDragSession = useCallback(() => {
    const session = sessionRef.current
    if (session?.sourceElement.hasPointerCapture(session.pointerId)) {
      try {
        session.sourceElement.releasePointerCapture(session.pointerId)
      } catch {
        // The source can be detached when a session reset removes the selected file card.
      }
    }
    if (session?.hasMoved || isDraggingRef.current) {
      callbacksRef.current.onDragStateChange(false)
    }
    sessionRef.current = null
    isDraggingRef.current = false
    setIsDragging(false)
    setDragPosition(null)
    setDragSource(null)
  }, [])

  useEffect(() => {
    cancelDragSession()
  }, [cancelDragSession, resetToken])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = sessionRef.current
      if (!session || session.pointerId !== event.pointerId) return

      const distance = Math.hypot(
        event.clientX - session.startX,
        event.clientY - session.startY,
      )
      if (!session.hasMoved && distance < FILE_DRAG_THRESHOLD_PX) return

      if (!session.hasMoved) {
        session.hasMoved = true
        isDraggingRef.current = true
        setIsDragging(true)
        setDragSource(session.dragSource)
        callbacksRef.current.onDragStateChange(true)
      }

      const point = { x: event.clientX, y: event.clientY }
      setDragPosition(point)
      callbacksRef.current.onDragMove(point)
    }

    const finishPointer = (event: PointerEvent, shouldDrop: boolean) => {
      const session = sessionRef.current
      if (!session || session.pointerId !== event.pointerId) return

      if (session.hasMoved) {
        if (shouldDrop) {
          callbacksRef.current.onDrop(
            { x: event.clientX, y: event.clientY },
            session.dragSource,
          )
        }
        callbacksRef.current.onDragStateChange(false)
      }
      suppressClickRef.current = session.hasMoved
      if (session.sourceElement.hasPointerCapture(event.pointerId)) {
        session.sourceElement.releasePointerCapture(event.pointerId)
      }
      sessionRef.current = null
      isDraggingRef.current = false
      setIsDragging(false)
      setDragPosition(null)
      setDragSource(null)
    }

    const handlePointerUp = (event: PointerEvent) => finishPointer(event, true)
    const handlePointerCancel = (event: PointerEvent) => finishPointer(event, false)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      cancelDragSession()
    }
  }, [cancelDragSession])

  const onPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    source: FileDragSource,
  ) => {
    if (event.button !== 0) return
    suppressClickRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    sessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      hasMoved: false,
      sourceElement: event.currentTarget,
      dragSource: source,
    }
  }

  const shouldSuppressClick = useCallback(() => {
    const shouldSuppress = suppressClickRef.current
    suppressClickRef.current = false
    return shouldSuppress
  }, [])

  const getPointerHandlers = useCallback((source: FileDragSource) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => onPointerDown(event, source),
  }), [])

  return {
    isDragging,
    dragPosition,
    dragSource,
    getPointerHandlers,
    shouldSuppressClick,
  }
}
