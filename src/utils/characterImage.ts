import type { DetectedPersonBox } from '../types/character'

const SOURCE_MAX_EDGE = 1440
const CROP_MAX_EDGE = 1024

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法读取图片'))
    image.src = source
  })
}

function renderImage(
  image: HTMLImageElement,
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  sourceHeight: number,
  maxEdge: number,
) {
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sourceWidth * scale))
  canvas.height = Math.max(1, Math.round(sourceHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法创建图片画布')

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return canvas.toDataURL('image/jpeg', 0.9)
}

export async function normalizeSourcePhoto(source: string) {
  const image = await loadImage(source)
  return renderImage(image, 0, 0, image.naturalWidth, image.naturalHeight, SOURCE_MAX_EDGE)
}

export async function cropDetectedPerson(source: string, box: DetectedPersonBox) {
  const image = await loadImage(source)
  const paddingX = box.width * 0.12
  const paddingY = box.height * 0.1
  const left = Math.max(0, box.x - paddingX)
  const top = Math.max(0, box.y - paddingY)
  const right = Math.min(1, box.x + box.width + paddingX)
  const bottom = Math.min(1, box.y + box.height + paddingY)

  return renderImage(
    image,
    left * image.naturalWidth,
    top * image.naturalHeight,
    Math.max(1, (right - left) * image.naturalWidth),
    Math.max(1, (bottom - top) * image.naturalHeight),
    CROP_MAX_EDGE,
  )
}
