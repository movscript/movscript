import { api } from '@/shared/infrastructure/api'
import { resolveResourceUrl } from '@/shared/ui/resourceUrl'
import type { RawResource } from '@/types'

export interface ResourceBlobLoadOptions {
  signal?: AbortSignal
  onDownloadProgress?: (event: { loaded: number; total?: number }) => void
}

export async function loadResourceBlob(resource: RawResource, options?: ResourceBlobLoadOptions): Promise<Blob> {
  return loadResourceUrlBlob(resolveResourceUrl(resource), options)
}

export async function loadResourceFileBlob(resourceId: number, options?: ResourceBlobLoadOptions): Promise<Blob> {
  const res = await api.get(`/resources/${resourceId}/file`, {
    responseType: 'blob',
    signal: options?.signal,
    onDownloadProgress: options?.onDownloadProgress,
  })
  return res.data as Blob
}

export async function loadResourceUrlBlob(src: string, options?: ResourceBlobLoadOptions): Promise<Blob> {
  if (requiresResourceAPIAuth(src)) {
    const res = await api.get(normalizeResourceAPIAuthPath(src), {
      baseURL: normalizeResourceAPIAuthBaseURL(src),
      responseType: 'blob',
      signal: options?.signal,
      onDownloadProgress: options?.onDownloadProgress,
    })
    return res.data as Blob
  }

  const res = await fetch(src, { signal: options?.signal })
  if (!res.ok) throw new Error(`Failed to load media: ${res.status}`)
  return res.blob()
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('failed to read blob as data URL'))
    reader.readAsDataURL(blob)
  })
}

function requiresResourceAPIAuth(src: string): boolean {
  try {
    const url = new URL(src, window.location.origin)
    return url.pathname.startsWith('/api/v1/resources/')
  } catch {
    return src.startsWith('/api/v1/resources/')
  }
}

function normalizeResourceAPIAuthPath(src: string): string {
  try {
    const url = new URL(src, window.location.origin)
    return url.pathname.replace(/^\/api\/v1/, '') + url.search
  } catch {
    return src.replace(/^\/api\/v1/, '')
  }
}

function normalizeResourceAPIAuthBaseURL(src: string): string | undefined {
  try {
    const url = new URL(src, window.location.origin)
    if (url.origin !== window.location.origin) return `${url.origin}/api/v1`
  } catch {
    return undefined
  }
  return undefined
}
