import { forwardRef, useEffect, useRef, useState, type AudioHTMLAttributes, type ImgHTMLAttributes, type VideoHTMLAttributes } from 'react'
import { ResourceAuthAudio, ResourceAuthImage, ResourceAuthVideo } from '@movscript/ui/business/resource'
import {
  acquireCachedInlineImageMediaUrl,
  acquireCachedResourceMediaUrl,
  loadResourceUrlBlob,
} from './resourceMediaBrowser.js'
import {
  compactResourceMediaDiagnosticElementRect,
  compactResourceMediaDiagnosticSrc,
  resourceMediaDiagnosticsEnabled,
} from './resourceMediaDiagnostics.js'

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
  const [blobUrl, setBlobUrl] = useState<string | undefined>(() => (
    src && (typeof window === 'undefined' || canUseDirectMediaSrc(src)) ? src : undefined
  ))

  useEffect(() => {
    if (!src) return
    if (isInlineImageDataUrl(src)) {
      let active = true
      let releaseObjectUrl: (() => void) | undefined
      setBlobUrl(undefined)
      const loadInlineImageDataUrl = async () => {
        const cached = await acquireCachedInlineImageMediaUrl(
          src,
          async () => displayableImageBlob(dataUrlToBlob(src)),
          thumbnailMaxSize
            ? {
                variantKey: `thumb:${thumbnailMaxSize}`,
                transformBlob: (blob) => downscaleImageBlob(blob, thumbnailMaxSize),
              }
            : undefined,
        )
        releaseObjectUrl = cached.release
        if (!active) {
          cached.release()
          return
        }
        setBlobUrl(cached.url)
      }
      loadInlineImageDataUrl().catch(() => {
        if (active) setBlobUrl(undefined)
      })
      return () => {
        active = false
        releaseObjectUrl?.()
        setBlobUrl(undefined)
      }
    }
    if (!requiresResourceAPIAuth(src)) {
      setBlobUrl(src)
      return
    }
    let active = true
    let releaseObjectUrl: (() => void) | undefined
    acquireCachedResourceMediaUrl(src, async () => displayableImageBlob(await loadResourceUrlBlob(src)), thumbnailMaxSize
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

function canUseDirectMediaSrc(src: string): boolean {
  return !requiresResourceAPIAuth(src) && !isInlineImageDataUrl(src)
}

function requiresResourceAPIAuth(src: string): boolean {
  try {
    const url = new URL(src, typeof window === 'undefined' ? 'http://localhost' : window.location.origin)
    return url.pathname.startsWith('/api/v1/resources/')
  } catch {
    return src.startsWith('/api/v1/resources/')
  }
}

function isInlineImageDataUrl(src: string): boolean {
  return /^data:image\/[a-z0-9.+-]+[;,]/i.test(src)
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)?((?:;[^,]*)?),(.*)$/is.exec(dataUrl)
  if (!match) throw new Error('Invalid image data URL')
  const mimeType = match[1] || 'application/octet-stream'
  const metadata = match[2] ?? ''
  const payload = match[3] ?? ''
  if (!metadata.toLowerCase().includes(';base64')) {
    return new Blob([decodeURIComponent(payload)], { type: mimeType })
  }

  const binary = atob(payload.replace(/\s/g, ''))
  const chunks: ArrayBuffer[] = []
  const chunkSize = 8192
  for (let offset = 0; offset < binary.length; offset += chunkSize) {
    const slice = binary.slice(offset, offset + chunkSize)
    const buffer = new ArrayBuffer(slice.length)
    const bytes = new Uint8Array(buffer)
    for (let index = 0; index < slice.length; index += 1) {
      bytes[index] = slice.charCodeAt(index)
    }
    chunks.push(buffer)
  }
  return new Blob(chunks, { type: mimeType })
}

async function displayableImageBlob(blob: Blob): Promise<Blob> {
  if (!await isHeicBlob(blob)) return blob
  const heic2any = await loadHeic2Any()
  const converted = await heic2any({ blob, toType: 'image/jpeg', quality: 0.92 })
  return Array.isArray(converted) ? converted[0] ?? blob : converted
}

type Heic2Any = (options: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]>

async function loadHeic2Any(): Promise<Heic2Any> {
  const importer = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{ default: Heic2Any }>
  const module = await importer('heic2any')
  return module.default
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
  const type = blob.type.toLowerCase().split(';')[0] ?? ''
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

interface ImgProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string | undefined
  diagnosticLabel?: string
  thumbnailMaxSize?: number
}

export function AuthedImage({ src, className, diagnosticLabel, thumbnailMaxSize, onLoad, onError, ...props }: ImgProps) {
  const {
    loading = 'lazy',
    decoding = 'async',
    ...imageProps
  } = props
  const lazyResolution = useLazyMediaResolution(src, loading === 'eager')
  const blobUrl = useAuthBlobUrl(lazyResolution.ready ? src : undefined, thumbnailMaxSize)
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
  if (!lazyResolution.ready) {
    return (
      <span ref={lazyResolution.ref} style={{ display: 'block', minHeight: 1 }}>
        <ResourceAuthImage
          src={undefined}
          isLoading
          className={className}
          loading={loading}
          decoding={decoding}
          {...imageProps}
        />
      </span>
    )
  }

  return (
    <ResourceAuthImage
      src={blobUrl}
      isLoading={!blobUrl}
      className={className}
      loading={loading}
      decoding={decoding}
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
      {...imageProps}
    />
  )
}

function useLazyMediaResolution(src: string | undefined, eager = false) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const canObserve = typeof window !== 'undefined' && typeof IntersectionObserver !== 'undefined'
  const [readySrc, setReadySrc] = useState<string | null>(() => (
    !src || eager || !canObserve ? (src ?? null) : null
  ))
  const ready = !src || eager || !canObserve || readySrc === src

  useEffect(() => {
    if (!src) {
      setReadySrc(null)
      return
    }
    if (eager || !canObserve) {
      setReadySrc(src)
      return
    }
    if (readySrc === src) return

    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setReadySrc(src)
      observer.disconnect()
    }, { rootMargin: '900px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [canObserve, eager, readySrc, src])

  return { ref, ready }
}

interface VideoProps extends VideoHTMLAttributes<HTMLVideoElement> {
  src: string | undefined
  diagnosticLabel?: string
  lazy?: boolean
}

function mediaDiagnosticsEnabled() {
  return resourceMediaDiagnosticsEnabled({
    dev: false,
    renderDiagnostics: undefined,
    search: typeof window === 'undefined' ? '' : window.location.search,
  })
}

function compactMediaSrc(src: string | undefined) {
  return compactResourceMediaDiagnosticSrc(src, typeof window === 'undefined' ? 'http://localhost' : window.location.origin)
}

function compactMediaRect(element: HTMLElement) {
  return compactResourceMediaDiagnosticElementRect(element)
}

export const AuthedVideo = forwardRef<HTMLVideoElement, VideoProps>(function AuthedVideo({ src, diagnosticLabel, lazy = true, onLoadedMetadata, onError, className, autoPlay, ...props }, ref) {
  const lazyResolution = useLazyMediaResolution(src, !lazy || Boolean(autoPlay))
  const blobUrl = useAuthBlobUrl(lazyResolution.ready ? src : undefined)
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
  if (!lazyResolution.ready) {
    return <span ref={lazyResolution.ref} className={className} style={{ display: 'block', minHeight: 1 }} />
  }
  return (
    <ResourceAuthVideo
      videoRef={ref}
      src={blobUrl}
      className={className}
      autoPlay={autoPlay}
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
})

interface AudioProps extends AudioHTMLAttributes<HTMLAudioElement> {
  src: string | undefined
}

export function AuthedAudio({ src, ...props }: AudioProps) {
  const blobUrl = useAuthBlobUrl(src)
  if (!src) return null
  return <ResourceAuthAudio src={blobUrl} {...props} />
}
