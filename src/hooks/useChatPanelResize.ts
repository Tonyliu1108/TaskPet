import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'

export type ChatPanelSize = {
  width: number
  height: number
}

type UseChatPanelResizeOptions = {
  workspaceLeft: number
  automaticSize: ChatPanelSize
}

type ResizeSession = {
  startX: number
  startY: number
  startWidth: number
  startHeight: number
}

type ViewportSize = {
  width: number
  height: number
}

const CHAT_PANEL_SIZE_STORAGE_KEY = 'taskpet.demo.chatPanelSize'
const MIN_WIDTH = 340
const MIN_HEIGHT = 380
const HEADER_HEIGHT = 68
const VIEWPORT_GAP = 16

function getViewportSize(): ViewportSize {
  return {
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }
}

function getLimits(workspaceLeft: number, viewport: ViewportSize) {
  return {
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    maxWidth: Math.max(MIN_WIDTH, viewport.width - workspaceLeft - VIEWPORT_GAP * 2),
    maxHeight: Math.max(
      MIN_HEIGHT,
      viewport.height - HEADER_HEIGHT - VIEWPORT_GAP * 2,
    ),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clampSize(
  size: ChatPanelSize,
  limits: ReturnType<typeof getLimits>,
): ChatPanelSize {
  return {
    width: clamp(Math.round(size.width), limits.minWidth, limits.maxWidth),
    height: clamp(Math.round(size.height), limits.minHeight, limits.maxHeight),
  }
}

function restoreManualSize(
  workspaceLeft: number,
  viewport: ViewportSize,
): ChatPanelSize | null {
  if (typeof window === 'undefined') return null

  try {
    const storedSize = window.sessionStorage.getItem(CHAT_PANEL_SIZE_STORAGE_KEY)
    if (!storedSize) return null

    const parsedSize = JSON.parse(storedSize) as Partial<ChatPanelSize>
    if (
      typeof parsedSize.width !== 'number' ||
      !Number.isFinite(parsedSize.width) ||
      typeof parsedSize.height !== 'number' ||
      !Number.isFinite(parsedSize.height)
    ) return null

    return clampSize(
      { width: parsedSize.width, height: parsedSize.height },
      getLimits(workspaceLeft, viewport),
    )
  } catch {
    return null
  }
}

export function useChatPanelResize({
  workspaceLeft,
  automaticSize,
}: UseChatPanelResizeOptions) {
  const resizeSessionRef = useRef<ResizeSession | null>(null)
  const [viewport, setViewport] = useState(getViewportSize)
  const [manualSize, setManualSize] = useState<ChatPanelSize | null>(() => (
    restoreManualSize(workspaceLeft, getViewportSize())
  ))
  const [isResizing, setIsResizing] = useState(false)
  const limits = getLimits(workspaceLeft, viewport)
  const size = clampSize(manualSize ?? automaticSize, limits)

  useEffect(() => {
    const handleWindowResize = () => setViewport(getViewportSize())
    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [])

  useEffect(() => {
    setManualSize((current) => current ? clampSize(current, limits) : null)
  }, [limits.maxHeight, limits.maxWidth])

  useEffect(() => {
    if (!manualSize) return

    try {
      window.sessionStorage.setItem(
        CHAT_PANEL_SIZE_STORAGE_KEY,
        JSON.stringify(manualSize),
      )
    } catch {
      // Resizing still works in memory if sessionStorage is unavailable.
    }
  }, [manualSize])

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const session = resizeSessionRef.current
      if (!session) return

      setManualSize(clampSize({
        width: session.startWidth - (event.clientX - session.startX),
        height: session.startHeight - (event.clientY - session.startY),
      }, limits))
    }

    const handleMouseUp = () => {
      if (!resizeSessionRef.current) return
      resizeSessionRef.current = null
      setIsResizing(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [limits.maxHeight, limits.maxWidth, limits.minHeight, limits.minWidth])

  const onResizeStart = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    resizeSessionRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: size.width,
      startHeight: size.height,
    }
    setIsResizing(true)
  }

  return {
    size,
    isResizing,
    isManualSize: manualSize !== null,
    resizeHandleProps: { onMouseDown: onResizeStart },
  }
}
