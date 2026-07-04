import type { BackendStatus } from './types'
import { isBackendReady } from './health'

export async function healthyBackendStatus(baseURL: string): Promise<BackendStatus | undefined> {
  return await isBackendReady(baseURL) ? { state: 'ready', baseURL } : undefined
}
