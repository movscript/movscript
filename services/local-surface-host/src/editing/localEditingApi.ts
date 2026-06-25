import { createLocalEditingMediaAPI } from '@movscript/editing-surface/service-host-api'
import type { ElectronAPI } from '@movscript/editing-surface/host-api'
import { mergeLocalSurfaceHostAPI } from '../adapters/localContentSurfaceHostApi.js'
import { normalizeBaseURL } from '../routes/localRouteLinks.js'

let cachedLocalEditingAPI:
  | {
    cacheKey: string
    api: ElectronAPI
  }
  | undefined

export function ensureLocalEditingAPI(query: URLSearchParams): void {
  const editingServiceBaseURL = normalizeBaseURL(
    query.get('editingServiceBaseURL')
      ?? query.get('editingServiceBaseUrl')
      ?? query.get('editingServiceURL')
      ?? query.get('editingServiceUrl'),
  )
  const mediaPipelineBaseURL = normalizeBaseURL(
    query.get('mediaPipelineBaseURL')
      ?? query.get('mediaPipelineBaseUrl')
      ?? query.get('mediaPipelineURL')
      ?? query.get('mediaPipelineUrl'),
  )

  if (typeof window === 'undefined') return
  if (!editingServiceBaseURL || !mediaPipelineBaseURL) {
    cachedLocalEditingAPI = undefined
    return
  }

  const cacheKey = `${editingServiceBaseURL}\n${mediaPipelineBaseURL}`
  if (!cachedLocalEditingAPI || cachedLocalEditingAPI.cacheKey !== cacheKey) {
    cachedLocalEditingAPI = {
      cacheKey,
      api: createLocalEditingMediaAPI({
        editingServiceBaseURL,
        mediaPipelineBaseURL,
      }),
    }
  }
  mergeLocalSurfaceHostAPI(cachedLocalEditingAPI.api as unknown as Parameters<typeof mergeLocalSurfaceHostAPI>[0])
}
