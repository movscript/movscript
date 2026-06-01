import type { VideoHTMLAttributes } from 'react'
import { ResourceImage } from '@/shared/ui/ResourceImage'
import { ResourceVideo } from '@/shared/ui/ResourceVideo'
import type { RawResource } from '@/types'

export function GenerationOutputPreview({
  resource,
  outputType,
  alt = '',
  videoProps,
}: {
  resource: RawResource
  outputType: 'image' | 'video'
  alt?: string
  videoProps?: Omit<VideoHTMLAttributes<HTMLVideoElement>, 'controls' | 'src' | 'resource'>
}) {
  if (outputType === 'image') return <ResourceImage resource={resource} alt={alt} />
  return <ResourceVideo resource={resource} {...videoProps} controls />
}
