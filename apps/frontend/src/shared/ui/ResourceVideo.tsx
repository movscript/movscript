import { forwardRef, type VideoHTMLAttributes } from 'react'
import { AuthedVideo } from '@/shared/ui/AuthedImage'
import { HlsVideo, isHlsSource } from '@/shared/ui/HlsVideo'
import { resolveResourceUrl } from '@/shared/ui/resourceUrl'
import type { RawResource } from '@/types'

export type ResourceVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src' | 'resource'> & {
  resource: RawResource
  diagnosticLabel?: string
}

export const ResourceVideo = forwardRef<HTMLVideoElement, ResourceVideoProps>(function ResourceVideo(
  { resource, ...props },
  ref,
) {
  const src = resolveResourceUrl(resource)
  if (isHlsResource(resource, src)) return <HlsVideo ref={ref} src={src} {...props} />
  return <AuthedVideo ref={ref} src={src} {...props} />
})

export function isHlsResource(resource: Pick<RawResource, 'mime_type' | 'url'>, src = resource.url): boolean {
  const mimeType = resource.mime_type.toLowerCase()
  return mimeType === 'application/vnd.apple.mpegurl'
    || mimeType === 'application/x-mpegurl'
    || isHlsSource(src)
}
