import { useEffect, useState } from 'react'
import { api } from '@/shared/infrastructure/api'
import { acquireCachedResourceMediaUrl } from '@/features/resources/domain/resourceMediaCache'
import { ResourceAuthAudio, ResourceAuthImage, ResourceAuthVideo } from '@movscript/ui'

const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'])
const IMAGE_THUMBNAIL_QUEUE_CONCURRENCY = 1

let activeThumbnailTasks = 0
const pendingThumbnailTasks: Array<() => void> = []

async function runImageThumbnailTask<T>(task: () => Promise<T>): Promise<T> {
  if (activeThumbnailTasks >= IMAGE_THUMBNAIL_QUEUE_CONCURRENCY) {
    await new Promise<void>((resolve) => pendingThumbnailTasks.push(resolve))
  }
  activeThumbnailTasks += 1
  try {
    return await task()
  } finally {
    activeThumbnailTasks = Math.max(0, activeThumbnailTasks - 1)
    pendingThumbnailTasks.shift()?.()
  }
}

function useAuthBlobUrl(src: string | undefined, thumbnailMaxSize?: number): string | undefined {
  const [blobUrl, setBlobUrl] = useState<string>()

  useEffect(() => {
    if (!src) return
    if (src.startsWith('data:')) {
      setBlobUrl(src)
      return
    }
    let active = true
    let releaseObjectUrl: (() => void) | undefined
    acquireCachedResourceMediaUrl(src, async () => displayableImageBlob(await fetchMediaBlob(src)), thumbnailMaxSize
      ? {
          variantKey: `thumb:${thumbnailMaxSize}`,
          transformBlob: (blob) => downscaleImageBlob(blob, thumbnailMaxSize),
        }
      : undefined)
      .then((cached) => {
        releaseObjectUrl = cached.release
        if (!active) {
          cached.release()
          return
        }
        setBlobUrl(cached.url)
      })
      .catch(() => {})
    return () => {
      active = false
      releaseObjectUrl?.()
      setBlobUrl(undefined)
    }
  }, [src, thumbnailMaxSize])

  return blobUrl
}

async function fetchMediaBlob(src: string): Promise<Blob> {
  if (requiresAPIAuth(src)) {
    const res = await api.get(normalizeAPIAuthPath(src), { baseURL: normalizeAPIAuthBaseURL(src), responseType: 'blob' })
    return res.data
  }
  const res = await fetch(src)
  if (!res.ok) throw new Error(`Failed to load media: ${res.status}`)
  return res.blob()
}

async function displayableImageBlob(blob: Blob): Promise<Blob> {
  if (!await isHeicBlob(blob)) return blob
  const { default: heic2any } = await import('heic2any')
  const converted = await heic2any({ blob, toType: 'image/jpeg', quality: 0.92 })
  return Array.isArray(converted) ? converted[0] : converted
}

async function downscaleImageBlob(blob: Blob, maxSize: number): Promise<Blob> {
  return runImageThumbnailTask(async () => {
    if (!blob.type.startsWith('image/')) return blob
    if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return blob
    const bitmap = await createImageBitmap(blob)
    try {
      const largestSide = Math.max(bitmap.width, bitmap.height)
      if (!largestSide || largestSide <= maxSize) return blob
      const scale = maxSize / largestSide
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { alpha: true })
      if (!context) return blob
      context.drawImage(bitmap, 0, 0, width, height)
      const type = blob.type === 'image/png' || blob.type === 'image/webp' ? blob.type : 'image/jpeg'
      const quality = type === 'image/jpeg' || type === 'image/webp' ? 0.82 : undefined
      return await new Promise<Blob>((resolve) => {
        canvas.toBlob((result) => resolve(result ?? blob), type, quality)
      })
    } finally {
      bitmap.close()
    }
  })
}

async function isHeicBlob(blob: Blob): Promise<boolean> {
  const type = blob.type.toLowerCase().split(';')[0]
  if (HEIC_MIME_TYPES.has(type)) return true
  const head = await blob.slice(0, 32).arrayBuffer()
  const bytes = new Uint8Array(head)
  if (bytes.length < 12) return false
  const signature = String.fromCharCode(...bytes.slice(4, 8))
  if (signature !== 'ftyp') return false
  for (let offset = 8; offset + 4 <= bytes.length; offset += 4) {
    const brand = String.fromCharCode(...bytes.slice(offset, offset + 4))
    if (HEIC_BRANDS.has(brand)) return true
  }
  return false
}

function requiresAPIAuth(src: string): boolean {
  try {
    const url = new URL(src, window.location.origin)
    return url.pathname.startsWith('/api/v1/resources/')
  } catch {
    return src.startsWith('/api/v1/resources/')
  }
}

function normalizeAPIAuthPath(src: string): string {
  try {
    const url = new URL(src, window.location.origin)
    return url.pathname.replace(/^\/api\/v1/, '') + url.search
  } catch {
    return src.replace(/^\/api\/v1/, '')
  }
}

function normalizeAPIAuthBaseURL(src: string): string | undefined {
  try {
    const url = new URL(src, window.location.origin)
    if (url.origin !== window.location.origin) return `${url.origin}/api/v1`
  } catch {
    return undefined
  }
  return undefined
}

interface ImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | undefined
  diagnosticLabel?: string
  thumbnailMaxSize?: number
}

// Use instead of raw media elements for URLs that need the API Authorization header.
export function AuthedImage({ src, className, diagnosticLabel, thumbnailMaxSize, onLoad, onError, ...props }: ImgProps) {
  const blobUrl = useAuthBlobUrl(src, thumbnailMaxSize)
  const variantLabel = thumbnailMaxSize ? `thumb:${thumbnailMaxSize}` : 'full'
  useEffect(() => {
    if (!mediaDiagnosticsEnabled() || !src) return
    console.info(`[canvas:media] image request label=${diagnosticLabel ?? 'image'} variant=${variantLabel} src=${compactMediaSrc(src)}`)
  }, [diagnosticLabel, src, variantLabel])

  useEffect(() => {
    if (!mediaDiagnosticsEnabled() || !src || !blobUrl) return
    console.info(`[canvas:media] image blob-ready label=${diagnosticLabel ?? 'image'} variant=${variantLabel} src=${compactMediaSrc(src)} blob=${compactMediaSrc(blobUrl)}`)
    return () => {
      console.info(`[canvas:media] image unmount label=${diagnosticLabel ?? 'image'} variant=${variantLabel} src=${compactMediaSrc(src)}`)
    }
  }, [blobUrl, diagnosticLabel, src, variantLabel])

  if (!src) return null
  return (
    <ResourceAuthImage
      src={blobUrl}
      isLoading={!blobUrl}
      className={className}
      onLoad={(event) => {
        if (mediaDiagnosticsEnabled()) {
          const image = event.currentTarget
          console.info(
            `[canvas:media] image load label=${diagnosticLabel ?? 'image'} variant=${variantLabel} src=${compactMediaSrc(src)} rect=${compactMediaRect(image)} natural=${image.naturalWidth}x${image.naturalHeight} complete=${image.complete}`,
          )
        }
        onLoad?.(event)
      }}
      onError={(event) => {
        if (mediaDiagnosticsEnabled()) {
          console.warn(`[canvas:media] image error label=${diagnosticLabel ?? 'image'} src=${compactMediaSrc(src)}`)
        }
        onError?.(event)
      }}
      {...props}
    />
  )
}

interface VideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string | undefined
  diagnosticLabel?: string
}

function mediaDiagnosticsEnabled() {
  if (!import.meta.env.DEV) return false
  if (import.meta.env.VITE_MOVSCRIPT_AGENT_MODE_RENDER_DIAGNOSTICS === '1') return true
  try {
    if (new URLSearchParams(window.location.search).has('canvasDebug')) return true
    return !!window.localStorage.getItem('movscript.canvasDebug')
  } catch {
    return false
  }
}

function compactMediaSrc(src: string | undefined) {
  if (!src) return 'empty'
  try {
    const url = new URL(src, window.location.origin)
    return `${url.pathname}${url.search}`
  } catch {
    return src.length > 96 ? `${src.slice(0, 96)}...` : src
  }
}

function compactMediaRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return `${Math.round(rect.width)}x${Math.round(rect.height)}+${Math.round(rect.left)}+${Math.round(rect.top)}`
}

export function AuthedVideo({ src, diagnosticLabel, onLoadedMetadata, onError, ...props }: VideoProps) {
  const blobUrl = useAuthBlobUrl(src)
  useEffect(() => {
    if (!mediaDiagnosticsEnabled() || !src) return
    console.info(`[canvas:media] video request label=${diagnosticLabel ?? 'video'} src=${compactMediaSrc(src)}`)
  }, [diagnosticLabel, src])

  useEffect(() => {
    if (!mediaDiagnosticsEnabled() || !src || !blobUrl) return
    console.info(`[canvas:media] video blob-ready label=${diagnosticLabel ?? 'video'} src=${compactMediaSrc(src)} blob=${compactMediaSrc(blobUrl)}`)
    return () => {
      console.info(`[canvas:media] video unmount label=${diagnosticLabel ?? 'video'} src=${compactMediaSrc(src)}`)
    }
  }, [blobUrl, diagnosticLabel, src])

  if (!src) return null
  return (
    <ResourceAuthVideo
      src={blobUrl}
      onLoadedMetadata={(event) => {
        if (mediaDiagnosticsEnabled()) {
          const video = event.currentTarget
          console.info(
            `[canvas:media] video metadata label=${diagnosticLabel ?? 'video'} src=${compactMediaSrc(src)} rect=${compactMediaRect(video)} natural=${video.videoWidth}x${video.videoHeight} duration=${Number.isFinite(video.duration) ? video.duration.toFixed(2) : 'na'} readyState=${video.readyState}`,
          )
        }
        onLoadedMetadata?.(event)
      }}
      onError={(event) => {
        if (mediaDiagnosticsEnabled()) {
          const video = event.currentTarget
          const error = video.error
          console.warn(`[canvas:media] video error label=${diagnosticLabel ?? 'video'} src=${compactMediaSrc(src)} code=${error?.code ?? 'na'} message=${error?.message ?? ''}`)
        }
        onError?.(event)
      }}
      {...props}
    />
  )
}

interface AudioProps extends React.AudioHTMLAttributes<HTMLAudioElement> {
  src: string | undefined
}

export function AuthedAudio({ src, ...props }: AudioProps) {
  const blobUrl = useAuthBlobUrl(src)
  if (!src) return null
  return <ResourceAuthAudio src={blobUrl} {...props} />
}
