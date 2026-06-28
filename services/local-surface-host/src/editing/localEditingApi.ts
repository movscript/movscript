import { createLocalEditingMediaAPI } from '@movscript/editing-surface/service-host-api'
import type { ElectronAPI } from '@movscript/editing-surface/host-api'
import { mergeLocalSurfaceHostAPI } from '../adapters/localContentSurfaceHostApi.js'

let cachedLocalEditingAPI:
  | {
    cacheKey: string
    api: ElectronAPI
  }
  | undefined

export function ensureLocalEditingAPI(_query: URLSearchParams): void {
  if (typeof window === 'undefined') return
  const daemonGatewayBaseURL = window.location.origin

  const cacheKey = daemonGatewayBaseURL
  if (!cachedLocalEditingAPI || cachedLocalEditingAPI.cacheKey !== cacheKey) {
    cachedLocalEditingAPI = {
      cacheKey,
      api: createLocalEditingMediaAPI({
        daemonGatewayBaseURL,
      }),
    }
  }
  mergeLocalSurfaceHostAPI(cachedLocalEditingAPI.api as unknown as Parameters<typeof mergeLocalSurfaceHostAPI>[0])
}
