import type { CSSProperties } from 'react'

import type { ElectronMediaPipelineClip } from '@movscript/editing-surface/contracts'

import {
  EDITING_CLIP_MAX_SCALE_PERCENT,
  EDITING_CLIP_MIN_SCALE_PERCENT,
} from './constants'
import { clampNumber } from './utils'

export function clipScalePercent(clip: ElectronMediaPipelineClip) {
  return clampNumber((clip.scale ?? 1) * 100, EDITING_CLIP_MIN_SCALE_PERCENT, EDITING_CLIP_MAX_SCALE_PERCENT, 100)
}

export function clipScaleFromPercent(value: number) {
  return clampNumber(value, EDITING_CLIP_MIN_SCALE_PERCENT, EDITING_CLIP_MAX_SCALE_PERCENT, 100) / 100
}

export function clipPositionPercent(value: unknown) {
  return clampNumber(value, 0, 100, 50)
}

export function normalizeClipVisualTransformPatch(
  patch: Pick<Partial<ElectronMediaPipelineClip>, 'scale' | 'xPercent' | 'yPercent'>,
): Pick<Partial<ElectronMediaPipelineClip>, 'scale' | 'xPercent' | 'yPercent'> {
  return {
    ...(patch.scale !== undefined ? { scale: clipScaleFromPercent(patch.scale * 100) } : {}),
    ...(patch.xPercent !== undefined ? { xPercent: clipPositionPercent(patch.xPercent) } : {}),
    ...(patch.yPercent !== undefined ? { yPercent: clipPositionPercent(patch.yPercent) } : {}),
  }
}

export function previewClipFrameStyle(clip: ElectronMediaPipelineClip): CSSProperties {
  const xPercent = clipPositionPercent(clip.xPercent)
  const yPercent = clipPositionPercent(clip.yPercent)
  const scale = clipScaleFromPercent(clipScalePercent(clip))
  return {
    left: `${xPercent}%`,
    top: `${yPercent}%`,
    transform: `translate(-50%, -50%) scale(${scale})`,
  }
}

export function cssObjectFitForClip(clip: ElectronMediaPipelineClip): CSSProperties['objectFit'] {
  if (clip.fit === 'cover' || clip.fit === 'crop') return 'cover'
  if (clip.fit === 'none') return 'none'
  return 'contain'
}
