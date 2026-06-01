import type { ImgHTMLAttributes } from 'react'
import { AuthedImage } from '@/shared/ui/AuthedImage'
import { resourceFileImageUrl } from '@/shared/ui/resourceFileUrl'

export type ResourceFileImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'resource'> & {
  resourceId?: number | null
  resourceUrl?: string
  diagnosticLabel?: string
  thumbnailMaxSize?: number
}

export function ResourceFileImage({ resourceId, resourceUrl, ...props }: ResourceFileImageProps) {
  return <AuthedImage src={resourceFileImageUrl(resourceId, resourceUrl)} {...props} />
}
