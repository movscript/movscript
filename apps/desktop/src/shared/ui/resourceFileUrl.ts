import {
  resourceFileImageUrl as coreResourceFileImageUrl,
  resourceFileUrl as coreResourceFileUrl,
} from '@movscript/resources'

export function resourceFileUrl(resourceId?: number | null, resourceUrl?: string) {
  return coreResourceFileUrl(resourceId, resourceUrl)
}

export function resourceFileImageUrl(resourceId?: number | null, resourceUrl?: string) {
  return coreResourceFileImageUrl(resourceId, resourceUrl)
}
