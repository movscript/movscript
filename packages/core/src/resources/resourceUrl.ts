export interface ResourceUrlLike {
  url: string
  direct_url?: string | null
}

export function isAbsoluteDisplayResourceUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')
}

export function resolveResourceUrl(resource: ResourceUrlLike, apiBaseURL: string): string {
  if (resource.direct_url) return resource.direct_url
  if (isAbsoluteDisplayResourceUrl(resource.url)) return resource.url
  return `${apiBaseURL}${resource.url}`
}

export function resourceFileUrl(resourceId?: number | null, resourceUrl?: string): string | undefined {
  if (resourceUrl) return resourceUrl
  return resourceId ? `/api/v1/resources/${resourceId}/file` : undefined
}

export function resourceFileImageUrl(resourceId?: number | null, resourceUrl?: string): string | undefined {
  return resourceFileUrl(resourceId, resourceUrl)
}
