import type { ImgHTMLAttributes } from 'react'
import { AuthedImage } from '@/shared/ui/AuthedImage'
import { resolveResourceUrl } from '@/shared/ui/resourceUrl'
import type { RawResource } from '@/types'

export type ResourceImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'resource'> & {
  resource: RawResource
  diagnosticLabel?: string
  thumbnailMaxSize?: number
}

export function ResourceImage({ resource, ...props }: ResourceImageProps) {
  return <AuthedImage src={resolveResourceUrl(resource)} {...props} />
}
