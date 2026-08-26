import { useEffect, useMemo, useState } from 'react'
import type { WalkingMotionAsset } from '../types/character'

export function isCompleteWalkingMotion(motion?: WalkingMotionAsset) {
  return Boolean(
    motion
    && motion.status === 'completed'
    && motion.frameCount > 0
    && motion.frames.length === motion.frameCount
    && motion.frames.every((frame, index) => frame.frameIndex === index && frame.imageUrl),
  )
}

export function useWalkingMotion(motion: WalkingMotionAsset | undefined, active: boolean) {
  const usable = isCompleteWalkingMotion(motion)
  const frameUrls = useMemo(() => usable ? motion!.frames.map((frame) => frame.imageUrl) : [], [motion, usable])
  const frameKey = frameUrls.join('|')
  const [frameIndex, setFrameIndex] = useState(0)
  const [status, setStatus] = useState<'idle' | 'preloading' | 'ready' | 'error'>('idle')

  useEffect(() => {
    let cancelled = false
    setFrameIndex(0)
    if (!active || !usable) {
      setStatus('idle')
      return () => { cancelled = true }
    }

    setStatus('preloading')
    Promise.all(frameUrls.map((url) => new Promise<void>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve()
      image.onerror = () => reject(new Error(`Walking frame failed: ${url}`))
      image.src = url
    }))).then(() => {
      if (!cancelled) setStatus('ready')
    }).catch(() => {
      if (!cancelled) setStatus('error')
    })
    return () => { cancelled = true }
  }, [active, frameKey, frameUrls, usable])

  useEffect(() => {
    if (!active || status !== 'ready' || !motion) return
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % motion.frameCount)
    }, motion.frameDurationMs || 1000 / motion.playbackFps)
    return () => window.clearInterval(timer)
  }, [active, motion, status])

  return {
    frameIndex,
    frameUrl: frameUrls[frameIndex] || '',
    status,
    markFrameError: () => setStatus('error'),
  }
}
