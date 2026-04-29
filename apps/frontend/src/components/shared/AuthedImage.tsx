import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

function useAuthBlobUrl(src: string | undefined): string | undefined {
  const [blobUrl, setBlobUrl] = useState<string>()

  useEffect(() => {
    if (!src) return
    if (!requiresAPIAuth(src)) {
      setBlobUrl(src)
      return
    }
    let active = true
    let objectUrl: string | undefined
    api.get(src, { baseURL: '', responseType: 'blob' })
      .then((res) => {
        if (!active) return
        objectUrl = URL.createObjectURL(res.data)
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

function requiresAPIAuth(src: string): boolean {
  try {
    const url = new URL(src, window.location.origin)
    return url.pathname.startsWith('/api/v1/resources/')
  } catch {
    return src.startsWith('/api/v1/resources/')
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
