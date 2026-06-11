import { forwardRef, type VideoHTMLAttributes } from 'react'
import { AuthedVideo } from '@/shared/ui/AuthedImage'
import { resourceFileUrl } from '@/shared/ui/resourceFileUrl'

export type ResourceFileVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src' | 'resource'> & {
  resourceId?: number | null
  resourceUrl?: string
  diagnosticLabel?: string
}

export const ResourceFileVideo = forwardRef<HTMLVideoElement, ResourceFileVideoProps>(function ResourceFileVideo(
  { resourceId, resourceUrl, ...props },
  ref,
) {
  return <AuthedVideo ref={ref} src={resourceFileUrl(resourceId, resourceUrl)} {...props} />
})
