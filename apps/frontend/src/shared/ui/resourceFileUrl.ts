export function resourceFileImageUrl(resourceId?: number | null, resourceUrl?: string) {
  if (resourceUrl) return resourceUrl
  return resourceId ? `/api/v1/resources/${resourceId}/file` : undefined
}
