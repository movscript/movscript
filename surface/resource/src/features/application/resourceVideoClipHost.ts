import type {
  SurfaceHostVideoClipInput,
  SurfaceHostVideoClipResult,
  SurfaceHostVideoClipStatus,
} from '@movscript/shared'
import { readSurfaceHostApi } from '@movscript/shared'

export function resourceMediaPipelineTrimApiAvailable(): boolean {
  const api = readSurfaceHostApi()
  return typeof api?.renderMediaPipelineSingleClip === 'function'
}

export async function trimResourceVideoSegment(input: SurfaceHostVideoClipInput): Promise<SurfaceHostVideoClipResult | undefined> {
  if (typeof window === 'undefined') return undefined
  const api = readSurfaceHostApi()
  return api?.renderMediaPipelineSingleClip?.(input)
}

export async function getResourceMediaPipelineTrimStatus(): Promise<SurfaceHostVideoClipStatus | undefined> {
  if (typeof window === 'undefined') return undefined
  const api = readSurfaceHostApi()
  return api?.getMediaPipelineFFmpegStatus?.()
}
