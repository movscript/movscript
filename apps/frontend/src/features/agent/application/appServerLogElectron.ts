import type { ElectronAppServerLogEvent } from '@/shared/contracts/electronApi'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

export function subscribeAppServerLogs(handler: (event: ElectronAppServerLogEvent) => void) {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.onAppServerLog?.(handler)
}
