import type { WalkingMotionAsset } from '../../types/character'
import type { CSSProperties, ReactNode } from 'react'
import { useWalkingMotion } from '../../hooks/useWalkingMotion'
import { getCharacterVisualStyle } from '../../utils/characterVisualMetrics'
import './WalkingPlayer.css'

type WalkingPlayerProps = {
  characterId: string
  motion: WalkingMotionAsset
  direction: 1 | -1
  active: boolean
  fallback: ReactNode
}

export function WalkingPlayer({ characterId, motion, direction, active, fallback }: WalkingPlayerProps) {
  const { frameIndex, frameUrl, status, markFrameError } = useWalkingMotion(motion, active)
  const visualStyle = getCharacterVisualStyle(motion.visualMetrics)
  return (
    <span
      className="walking-player"
      data-walking-player="video-motion"
      data-walking-character-id={characterId}
      data-walking-frame-index={frameIndex}
      data-walking-frame-count={motion.frameCount}
      data-walking-fps={motion.playbackFps}
      data-visual-metrics={motion.visualMetrics?.aggregation || 'normalized-fallback'}
      data-visual-subject-height-ratio={motion.visualMetrics?.subjectHeightRatio}
      data-visual-baseline-ratio={motion.visualMetrics?.baselineRatio}
      data-visual-sample-count={motion.visualMetrics?.sampleCount}
      style={{ '--walking-direction': direction, ...visualStyle } as CSSProperties}
    >
      {status === 'ready' && frameUrl ? (
        <img
          src={frameUrl}
          alt=""
          draggable={false}
          onError={markFrameError}
        />
      ) : fallback}
    </span>
  )
}
