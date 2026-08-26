import type { CSSProperties } from 'react'
import type { AlphaBoundingBox, CharacterVisualMetrics } from '../types/character'

export const CHARACTER_VIEWPORT_TARGET_SUBJECT_HEIGHT_RATIO = 0.85
export const CHARACTER_VIEWPORT_TARGET_BASELINE_RATIO = 0.94

// B1/B1.1 normalization targets are the safe fallback for older normalized
// assets. Current recovered assets carry their measured Alpha bbox metrics.
export const DEFAULT_NORMALIZED_VISUAL_METRICS: CharacterVisualMetrics = {
  sourceWidth: 768,
  sourceHeight: 768,
  subjectHeightRatio: 0.86,
  baselineRatio: 0.94,
  measurement: 'alpha-bbox-v1',
  alphaThreshold: 8,
  aggregation: 'single',
  sampleCount: 1,
}

export function createAlphaVisualMetrics(
  alphaBBox: AlphaBoundingBox,
  sourceWidth = 768,
  sourceHeight = 768,
): CharacterVisualMetrics {
  return {
    sourceWidth,
    sourceHeight,
    subjectHeightRatio: (alphaBBox.bottom - alphaBBox.top) / sourceHeight,
    baselineRatio: alphaBBox.bottom / sourceHeight,
    measurement: 'alpha-bbox-v1',
    alphaThreshold: 8,
    alphaBBox,
    aggregation: 'single',
    sampleCount: 1,
  }
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export function createMedianVisualMetrics(
  samples: CharacterVisualMetrics[],
): CharacterVisualMetrics {
  if (samples.length === 0) return DEFAULT_NORMALIZED_VISUAL_METRICS
  const subjectHeights = samples.map((sample) => sample.subjectHeightRatio)
  const baselines = samples.map((sample) => sample.baselineRatio)
  return {
    sourceWidth: samples[0].sourceWidth,
    sourceHeight: samples[0].sourceHeight,
    subjectHeightRatio: median(subjectHeights),
    baselineRatio: median(baselines),
    measurement: 'alpha-bbox-v1',
    alphaThreshold: 8,
    aggregation: 'median',
    sampleCount: samples.length,
    subjectHeightRatioRange: [Math.min(...subjectHeights), Math.max(...subjectHeights)],
    baselineRatioRange: [Math.min(...baselines), Math.max(...baselines)],
  }
}

export type CharacterVisualStyle = CSSProperties & {
  '--character-canvas-scale': number
  '--character-canvas-top-ratio': number
}

export function getCharacterVisualStyle(
  visualMetrics?: CharacterVisualMetrics,
): CharacterVisualStyle {
  const metrics = visualMetrics ?? DEFAULT_NORMALIZED_VISUAL_METRICS
  const canvasScale = CHARACTER_VIEWPORT_TARGET_SUBJECT_HEIGHT_RATIO / metrics.subjectHeightRatio
  const canvasTopRatio = CHARACTER_VIEWPORT_TARGET_BASELINE_RATIO - metrics.baselineRatio * canvasScale
  return {
    '--character-canvas-scale': canvasScale,
    '--character-canvas-top-ratio': canvasTopRatio,
  }
}
