import type { AudioHTMLAttributes } from 'react'
import { AuthedAudio } from '@/shared/ui/AuthedImage'
import { resolveResourceUrl } from '@/shared/ui/resourceUrl'
import type { RawResource } from '@/types'

export type ResourceAudioProps = Omit<AudioHTMLAttributes<HTMLAudioElement>, 'src' | 'resource'> & {
  resource: RawResource
}

export function ResourceAudio({ resource, ...props }: ResourceAudioProps) {
  return <AuthedAudio src={resolveResourceUrl(resource)} {...props} />
}
