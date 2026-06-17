import type { AudioHTMLAttributes, VideoHTMLAttributes } from 'react'
import { ResourceImage } from '@/shared/ui/ResourceImage'
import { ResourceVideo } from '@/shared/ui/ResourceVideo'
import type { RawResource } from '@/types'

export function GenerationOutputPreview({
  resource,
  outputType,
  alt = '',
  videoProps,
  audioProps,
}: {
  resource: RawResource
  outputType: 'image' | 'video' | 'audio'
  alt?: string
  videoProps?: Omit<VideoHTMLAttributes<HTMLVideoElement>, 'controls' | 'src' | 'resource'>
  audioProps?: Omit<AudioHTMLAttributes<HTMLAudioElement>, 'controls' | 'src'>
}) {
  if (outputType === 'image') return <ResourceImage resource={resource} alt={alt} />
  if (outputType === 'audio') return <audio src={resource.url} {...audioProps} controls className="w-full" />
  return <ResourceVideo resource={resource} {...videoProps} controls />
}
