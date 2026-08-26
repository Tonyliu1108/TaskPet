import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision'
import { useCallback, useState } from 'react'
import type { DetectedPersonBox } from '../types/character'

const MODEL_PATH = '/models/efficientdet_lite0.tflite'
const MODEL_DOWNLOAD_HINT = '本地人物识别模型尚未安装，请在项目根目录运行 python scripts/download_models.py 后刷新页面。'
const WASM_PATH = '/mediapipe'
const MIN_SCORE = 0.35
const MIN_AREA_RATIO = 0.012

let detectorPromise: Promise<ObjectDetector> | null = null

async function ensureModelAvailable() {
  try {
    const response = await fetch(MODEL_PATH, { method: 'HEAD', cache: 'no-store' })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || contentType.includes('text/html')) {
      throw new Error(MODEL_DOWNLOAD_HINT)
    }
  } catch (error) {
    if (error instanceof Error && error.message === MODEL_DOWNLOAD_HINT) throw error
    throw new Error(MODEL_DOWNLOAD_HINT)
  }
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法读取待检测图片'))
    image.src = source
  })
}

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      await ensureModelAvailable()
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
      return ObjectDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
        runningMode: 'IMAGE',
        categoryAllowlist: ['person'],
        scoreThreshold: MIN_SCORE,
        maxResults: 10,
      })
    })().catch((error) => {
      detectorPromise = null
      throw error
    })
  }
  return detectorPromise
}

export function usePersonDetection() {
  const [isModelLoading, setIsModelLoading] = useState(false)

  const detectPersons = useCallback(async (source: string): Promise<DetectedPersonBox[]> => {
    setIsModelLoading(true)
    try {
      const [detector, image] = await Promise.all([getDetector(), loadImage(source)])
      const imageArea = image.naturalWidth * image.naturalHeight
      const result = detector.detect(image)

      return result.detections
        .map((detection, index): DetectedPersonBox | null => {
          const category = detection.categories[0]
          const box = detection.boundingBox
          if (!box || !category || category.categoryName !== 'person') return null
          if (category.score < MIN_SCORE || box.width * box.height / imageArea < MIN_AREA_RATIO) return null

          return {
            id: `person-${index}-${Math.round(box.originX)}-${Math.round(box.originY)}`,
            x: Math.max(0, box.originX / image.naturalWidth),
            y: Math.max(0, box.originY / image.naturalHeight),
            width: Math.min(1, box.width / image.naturalWidth),
            height: Math.min(1, box.height / image.naturalHeight),
            score: category.score,
          }
        })
        .filter((person): person is DetectedPersonBox => person !== null)
        .sort((a, b) => b.width * b.height - a.width * a.height)
    } finally {
      setIsModelLoading(false)
    }
  }, [])

  return { detectPersons, isModelLoading }
}
