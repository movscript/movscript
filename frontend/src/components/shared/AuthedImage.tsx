import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

function useAuthBlobUrl(src: string | undefined): string | undefined {
  const [blobUrl, setBlobUrl] = useState<string>()

  useEffect(() => {
    if (!src) return
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

interface ImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | undefined
}

// Use instead of <img> for URLs that go through /api/v1/resources/:id/file (requires X-User-ID header).
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
