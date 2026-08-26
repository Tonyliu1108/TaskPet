import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type Dispatch,
  type DragEvent,
  type RefObject,
  type SetStateAction,
} from 'react'
import { CircleHelp, Cog, MessageCircle } from 'lucide-react'
import { WalkingPlayer } from '../WalkingPlayer/WalkingPlayer'
import { motionPresets, PET_SIZE } from '../../data/pet'
import { usePetAutoWalk } from '../../hooks/usePetAutoWalk'
import { usePetDrag } from '../../hooks/usePetDrag'
import { isCompleteWalkingMotion } from '../../hooks/useWalkingMotion'
import { getCharacterVisualStyle } from '../../utils/characterVisualMetrics'
import type {
  PetAppearance,
  PetAppearanceImage,
  PetBounds,
  PetPosition,
  PetProfile,
  PetState,
} from '../../types/pet'
import type { DemoTaskStage } from '../../types/task'
import type { WalkingMotionAsset } from '../../types/character'
import './DesktopPet.css'

type DesktopPetProps = {
  elementRef: RefObject<HTMLButtonElement>
  profile: PetProfile
  appearance: PetAppearance
  petState: PetState
  setPetState: Dispatch<SetStateAction<PetState>>
  position: PetPosition
  setPosition: Dispatch<SetStateAction<PetPosition>>
  boundsRef: RefObject<HTMLElement>
  taskStage: DemoTaskStage
  currentTaskStatusText: string | null
  isFileDragging: boolean
  isFileOverPet: boolean
  autoWalkDisabled: boolean
  activeCharacterId?: string
  walkingMotion?: WalkingMotionAsset
  onToggleChat: () => void
  onNativeFileDrop: (file: File, point: PetPosition) => void
}

const ENTER_DURATION_MS = 1500
const SAFE_GAP = 16

const stateLabels: Record<PetState, string> = {
  entering: '正在赶来',
  idle: '随时待命',
  walking: '散散步',
  chatting: '和你聊聊',
  thinking: '正在思考',
  working: '专心工作',
  sleeping: '休息一下',
  waiting: '等待确认',
  error: '遇到问题',
  celebrating: '完成啦',
}

export function DesktopPet({
  elementRef,
  profile,
  appearance,
  petState,
  setPetState,
  position,
  setPosition,
  boundsRef,
  taskStage,
  currentTaskStatusText,
  isFileDragging,
  isFileOverPet,
  autoWalkDisabled,
  activeCharacterId,
  walkingMotion,
  onToggleChat,
  onNativeFileDrop,
}: DesktopPetProps) {
  const [direction, setDirection] = useState<1 | -1>(-1)
  const [hasUserPositioned, setHasUserPositioned] = useState(false)
  const [failedImageSources, setFailedImageSources] = useState<string[]>([])
  const [isNativeFileOver, setIsNativeFileOver] = useState(false)
  const motionPreset = motionPresets[profile.motionStyle] ?? motionPresets.light
  const canAcceptFile = true
  const isReceivingFile = taskStage === 'receiving_file'
  const showFileOverPet = isFileOverPet || isNativeFileOver
  const imageCandidates: PetAppearanceImage[] = [
    {
      imageSrc: appearance.imageSrc,
      isNormalizedImage: appearance.isNormalizedImage,
      assetState: appearance.assetState,
      assetId: appearance.assetId,
      visualMetrics: appearance.visualMetrics,
    },
    ...(appearance.fallbackImages || []),
  ].filter((candidate) => candidate.imageSrc)
  const imageCandidateKey = imageCandidates.map((candidate) => candidate.imageSrc).join('|')
  const activeImage = imageCandidates.find((candidate) => !failedImageSources.includes(candidate.imageSrc))
  const activeImageVisualStyle = activeImage?.isNormalizedImage
    ? getCharacterVisualStyle(activeImage.visualMetrics)
    : undefined
  const videoWalkingMotion = isCompleteWalkingMotion(walkingMotion) ? walkingMotion : undefined
  const usesDedicatedWalkingGait = petState === 'walking' && !videoWalkingMotion && activeImage?.assetState === 'walking'

  useEffect(() => {
    setFailedImageSources([])
  }, [imageCandidateKey])

  const getBounds = useCallback((): PetBounds => {
    const workspaceRect = boundsRef.current?.getBoundingClientRect()
    const left = workspaceRect?.left ?? 278
    const top = workspaceRect?.top ?? 68
    const right = workspaceRect?.right ?? window.innerWidth
    const bottom = workspaceRect?.bottom ?? window.innerHeight

    return {
      minX: left + SAFE_GAP,
      maxX: Math.max(left + SAFE_GAP, right - PET_SIZE.width - SAFE_GAP),
      minY: top + 12,
      maxY: Math.max(top + 12, bottom - PET_SIZE.height - SAFE_GAP),
    }
  }, [boundsRef])

  useEffect(() => {
    const bounds = getBounds()
    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setPosition({ x: bounds.maxX, y: bounds.maxY })
      })
    })
    const completionTimer = window.setTimeout(() => {
      setPetState((current) => current === 'entering' ? 'idle' : current)
    }, ENTER_DURATION_MS + 80)

    return () => {
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
      window.clearTimeout(completionTimer)
    }
  }, [getBounds, setPetState, setPosition])

  useEffect(() => {
    const keepInsideWorkspace = () => {
      const bounds = getBounds()
      setPosition((current) => ({
        x: Math.min(Math.max(current.x, bounds.minX), bounds.maxX),
        y: Math.min(Math.max(current.y, bounds.minY), bounds.maxY),
      }))
    }

    window.addEventListener('resize', keepInsideWorkspace)
    return () => window.removeEventListener('resize', keepInsideWorkspace)
  }, [getBounds, setPosition])

  const { isDragging, pointerHandlers, shouldSuppressClick } = usePetDrag({
    elementRef,
    getBounds,
    setPosition,
    onPointerIntent: () => {
      setPetState((current) => current === 'walking' ? 'idle' : current)
    },
    onDragDetected: () => setHasUserPositioned(true),
  })

  usePetAutoWalk({
    petState,
    isDragging,
    disabled: hasUserPositioned || autoWalkDisabled || isFileDragging,
    position,
    setPosition,
    setPetState,
    setDirection,
    getBounds,
    motionPreset,
  })

  const handleClick = () => {
    if (shouldSuppressClick()) return
    onToggleChat()
  }

  const handleNativeDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setIsNativeFileOver(false)
    const file = event.dataTransfer.files[0]
    if (file) onNativeFileDrop(file, { x: event.clientX, y: event.clientY })
  }

  let statusLabel = stateLabels[petState]
  if (showFileOverPet) statusLabel = '松开交给我'
  else if (taskStage === 'awaiting_file') statusLabel = '等待销售表'
  else if (taskStage === 'receiving_file') statusLabel = '正在接收'
  else if (taskStage === 'planning') statusLabel = '正在规划'
  else if (taskStage === 'awaiting_confirmation') statusLabel = '等待确认'
  else if (taskStage === 'confirmed') statusLabel = '等待执行'
  else if (taskStage === 'executing') statusLabel = currentTaskStatusText ?? '正在执行'
  else if (taskStage === 'paused') statusLabel = currentTaskStatusText
    ? `已暂停 · ${currentTaskStatusText.replace(/^正在/, '')}`
    : '任务已暂停'
  else if (taskStage === 'waiting_business_confirmation') statusLabel = '需要你的确认'
  else if (taskStage === 'execution_complete') statusLabel = '执行完成'
  else if (taskStage === 'preparing_results') statusLabel = '正在整理分析结果'
  else if (taskStage === 'result_ready') {
    if (petState === 'celebrating') statusLabel = '分析完成！'
    else if (petState === 'working') statusLabel = stateLabels.working
    else statusLabel = '结果已就绪'
  }

  const style = {
    transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
    '--pet-direction': direction,
    '--pet-idle-duration': `${motionPreset.idleDurationMs}ms`,
    '--pet-idle-amplitude': `${motionPreset.idleAmplitudePx}px`,
    '--pet-walk-duration': `${motionPreset.walkDurationMs}ms`,
  } as CSSProperties

  const fallbackCharacter = activeImage ? (
    <span
      className={`desktop-pet__character-viewport ${usesDedicatedWalkingGait ? 'desktop-pet__character-viewport--gait' : ''}`}
      data-pet-gait={usesDedicatedWalkingGait ? 'two-step' : 'universal'}
      data-pet-image-fallback-index={imageCandidates.indexOf(activeImage)}
      data-visual-metrics={activeImage.visualMetrics ? 'alpha-bbox' : 'normalized-fallback'}
    >
      <img
        className={`desktop-pet__image ${activeImage.isNormalizedImage ? 'desktop-pet__image--normalized' : ''} ${usesDedicatedWalkingGait ? 'desktop-pet__image--gait-a' : ''}`}
        src={activeImage.imageSrc}
        alt=""
        draggable={false}
        data-pet-asset-state={activeImage.assetState}
        data-pet-asset-id={activeImage.assetId || 'master'}
        data-pet-gait-frame={usesDedicatedWalkingGait ? 'a' : 'single'}
        data-visual-subject-height-ratio={activeImage.visualMetrics?.subjectHeightRatio}
        data-visual-baseline-ratio={activeImage.visualMetrics?.baselineRatio}
        style={activeImageVisualStyle}
        onError={() => {
          setFailedImageSources((current) => current.includes(activeImage.imageSrc)
            ? current
            : [...current, activeImage.imageSrc])
        }}
      />
      {usesDedicatedWalkingGait && (
        <img
          className={`desktop-pet__image ${activeImage.isNormalizedImage ? 'desktop-pet__image--normalized' : ''} desktop-pet__image--gait-b`}
          src={activeImage.imageSrc}
          alt=""
          draggable={false}
          data-pet-asset-state={activeImage.assetState}
          data-pet-asset-id={activeImage.assetId || 'master'}
          data-pet-gait-frame="b"
          data-visual-subject-height-ratio={activeImage.visualMetrics?.subjectHeightRatio}
          data-visual-baseline-ratio={activeImage.visualMetrics?.baselineRatio}
          style={activeImageVisualStyle}
        />
      )}
    </span>
  ) : (
    <span className="human-pet">
      <i className="human-pet__hair-back" />
      <i className="human-pet__head">
        <b className="human-pet__hair" />
        <b className="human-pet__eye human-pet__eye--left" />
        <b className="human-pet__eye human-pet__eye--right" />
        <b className="human-pet__smile" />
      </i>
      <i className="human-pet__neck" />
      <i className="human-pet__arm human-pet__arm--left" />
      <i className="human-pet__arm human-pet__arm--right" />
      <i className="human-pet__body"><b>T</b></i>
      <i className="human-pet__leg human-pet__leg--left" />
      <i className="human-pet__leg human-pet__leg--right" />
    </span>
  )

  return (
    <button
      ref={elementRef}
      className={`desktop-pet desktop-pet--${petState} ${isDragging ? 'desktop-pet--dragging' : ''} ${showFileOverPet ? 'desktop-pet--file-over' : ''} ${showFileOverPet && canAcceptFile ? 'desktop-pet--drop-ready' : ''} ${isReceivingFile ? 'desktop-pet--receiving' : ''}`}
      type="button"
      style={style}
      aria-label={`${profile.name}桌宠，当前状态：${statusLabel}`}
      data-pet-state={petState}
      data-task-stage={taskStage}
      data-file-drop-ready={showFileOverPet && canAcceptFile ? 'true' : 'false'}
      data-pet-x={Math.round(position.x)}
      data-pet-y={Math.round(position.y)}
      onClick={handleClick}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          setIsNativeFileOver(true)
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsNativeFileOver(false)
      }}
      onDrop={handleNativeDrop}
      {...pointerHandlers}
    >
      {showFileOverPet && (
        <span className="desktop-pet__drop-zone" aria-hidden="true" />
      )}
      <span className="desktop-pet__status">
        <i className="desktop-pet__status-dot" />
        {statusLabel}
      </span>

      <span className="desktop-pet__thinking" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>

      <span className="desktop-pet__working-indicator" aria-hidden="true">
        <Cog size={15} />
      </span>

      <span className="desktop-pet__waiting-indicator" aria-hidden="true">
        <CircleHelp size={18} />
      </span>

      <span className="desktop-pet__celebration" aria-hidden="true">
        <i /><i /><i /><i /><i /><i />
      </span>

      <span
        className={`desktop-pet__character ${petState === 'walking' && videoWalkingMotion ? 'desktop-pet__character--video-motion' : ''}`}
        aria-hidden="true"
      >
        {petState === 'walking' && videoWalkingMotion && activeCharacterId ? (
          <WalkingPlayer
            characterId={activeCharacterId}
            motion={videoWalkingMotion}
            direction={direction}
            active
            fallback={fallbackCharacter}
          />
        ) : fallbackCharacter}
      </span>

      <span className="desktop-pet__label">
        <MessageCircle size={14} />
        <span>{appearance.name}</span>
        <i>·</i>
        <small>{showFileOverPet && canAcceptFile ? '松开交给我' : petState === 'chatting' ? '再次点击收起' : '点击聊聊'}</small>
      </span>
    </button>
  )
}
