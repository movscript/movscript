import { forwardRef, type VideoHTMLAttributes } from 'react'
import { AuthedVideo } from '@/shared/ui/AuthedImage'
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
  return <AuthedVideo ref={ref} src={resolveResourceUrl(resource)} {...props} />
})
