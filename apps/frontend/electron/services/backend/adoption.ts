import { isBackendReady } from './health'
import type { BackendStatus } from './types'

export async function healthyBackendStatus(baseURL: string): Promise<BackendStatus | null> {
  if (!await isBackendReady(baseURL)) return null
  return { state: 'ready', baseURL }
}
