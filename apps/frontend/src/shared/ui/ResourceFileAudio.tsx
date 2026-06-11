import type { AudioHTMLAttributes } from 'react'
import { AuthedAudio } from '@/shared/ui/AuthedImage'
import { resourceFileUrl } from '@/shared/ui/resourceFileUrl'

export type ResourceFileAudioProps = Omit<AudioHTMLAttributes<HTMLAudioElement>, 'src' | 'resource'> & {
  resourceId?: number | null
  resourceUrl?: string
}

export function ResourceFileAudio({ resourceId, resourceUrl, ...props }: ResourceFileAudioProps) {
  return <AuthedAudio src={resourceFileUrl(resourceId, resourceUrl)} {...props} />
}
