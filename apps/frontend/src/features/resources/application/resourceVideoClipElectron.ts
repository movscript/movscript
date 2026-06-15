import type {
  ElectronVideoClipInput,
  ElectronVideoClipResult,
  ElectronVideoClipStatus,
} from '@/shared/contracts/electronApi'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

export function resourceVideoClipApiAvailable(): boolean {
  return typeof readElectronApi()?.clipVideo === 'function'
}

export async function clipResourceVideo(input: ElectronVideoClipInput): Promise<ElectronVideoClipResult | undefined> {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.clipVideo?.(input)
}

export async function getResourceVideoClipStatus(): Promise<ElectronVideoClipStatus | undefined> {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.getVideoClipStatus?.()
}
