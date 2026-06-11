import type { VideoClipInput } from './types'
import {
  buildVideoCropFilter,
  hasVideoVisualCrop,
  normalizeTimelineSpeed,
} from '@movscript/core/resources'

export function buildCropFilter(input: Pick<VideoClipInput, 'cropLeftPercent' | 'cropRightPercent' | 'cropTopPercent' | 'cropBottomPercent'>): string {
  return buildVideoCropFilter(input)
}

export function hasVisualCrop(input: Pick<VideoClipInput, 'cropLeftPercent' | 'cropRightPercent' | 'cropTopPercent' | 'cropBottomPercent'>): boolean {
  return hasVideoVisualCrop(input)
}

export { normalizeTimelineSpeed }
