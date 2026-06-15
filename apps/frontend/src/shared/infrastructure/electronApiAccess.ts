import type { ElectronAPI } from '@/shared/contracts/electronApi'

export function readElectronApi(): ElectronAPI | undefined {
  if (typeof window === 'undefined') return undefined
  return window.api
}
