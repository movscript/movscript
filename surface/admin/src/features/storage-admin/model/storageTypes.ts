import type { RawResource, ResourceBinding } from '@admin/types'

export type ResourceAdminDetail = {
  resource: RawResource
  binding_count: number
  bindings: ResourceBinding[]
}

export function isImageResource(resource: RawResource): boolean {
  return resource.type === 'image' || resource.mime_type?.startsWith('image/')
}

export function isVideoResource(resource: RawResource): boolean {
  return resource.type === 'video' || resource.mime_type?.startsWith('video/')
}
