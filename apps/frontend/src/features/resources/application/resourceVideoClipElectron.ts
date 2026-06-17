import type {
  ElectronVideoClipInput,
  ElectronVideoClipResult,
  ElectronVideoClipStatus,
} from '@/shared/contracts/electronApi'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

export function resourceMediaPipelineTrimApiAvailable(): boolean {
  const api = readElectronApi()
  return typeof api?.renderMediaPipelineSingleClip === 'function'
}

export async function trimResourceVideoSegment(input: ElectronVideoClipInput): Promise<ElectronVideoClipResult | undefined> {
  if (typeof window === 'undefined') return undefined
  const api = readElectronApi()
  return api?.renderMediaPipelineSingleClip?.(input)
}

export async function getResourceMediaPipelineTrimStatus(): Promise<ElectronVideoClipStatus | undefined> {
  if (typeof window === 'undefined') return undefined
  const api = readElectronApi()
  return api?.getMediaPipelineFFmpegStatus?.()
}
