import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

const HEIC_EXTENSIONS = /\.(heic|heif)$/i
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'])

function useAuthBlobUrl(src: string | undefined): string | undefined {
  const [blobUrl, setBlobUrl] = useState<string>()

  useEffect(() => {
    if (!src) return
    if (!requiresAPIAuth(src) && !looksLikeHeicUrl(src) && !requiresBlobInspection(src)) {
      setBlobUrl(src)
      return
    }
    let active = true
    let objectUrl: string | undefined
    fetchMediaBlob(src)
      .then((res) => {
        if (!active) return
        return displayableImageBlob(res)
      })
      .then((blob) => {
        if (!active || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
      })
      .catch(() => {})
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setBlobUrl(undefined)
    }
  }, [src])

  return blobUrl
}

async function fetchMediaBlob(src: string): Promise<Blob> {
  if (requiresAPIAuth(src)) {
    const res = await api.get(normalizeAPIAuthPath(src), { responseType: 'blob' })
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

function looksLikeHeicUrl(src: string): boolean {
  try {
    return HEIC_EXTENSIONS.test(new URL(src, window.location.origin).pathname)
  } catch {
    return HEIC_EXTENSIONS.test(src)
  }
}

function requiresBlobInspection(src: string): boolean {
  return src.startsWith('blob:')
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

interface ImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | undefined
}

// Use instead of raw media elements for URLs that need the API Authorization header.
export function AuthedImage({ src, className, ...props }: ImgProps) {
  const blobUrl = useAuthBlobUrl(src)
  if (!src) return null
  if (!blobUrl) return <div className={cn('bg-muted animate-pulse', className)} />
  return <img src={blobUrl} className={className} {...props} />
}

interface VideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string | undefined
}

export function AuthedVideo({ src, ...props }: VideoProps) {
  const blobUrl = useAuthBlobUrl(src)
  if (!src) return null
  return <video src={blobUrl} {...props} />
}

interface AudioProps extends React.AudioHTMLAttributes<HTMLAudioElement> {
  src: string | undefined
}

export function AuthedAudio({ src, ...props }: AudioProps) {
  const blobUrl = useAuthBlobUrl(src)
  if (!src) return null
  return <audio src={blobUrl} {...props} />
}
