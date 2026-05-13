import { getAPIBaseURL, getAPIV1BaseURL } from '@/lib/config'
import type { AgentAttachment } from '@/store/agentStore'
import type { RawResource } from '@/types'

export function resourceUrl(resource: Pick<RawResource, 'url' | 'direct_url'>): string {
  const url = resource.direct_url || resource.url
  if (!url) return ''
  if (/^(https?:|blob:|data:)/i.test(url)) return url
  if (url.startsWith('/api/v1/')) return `${getAPIBaseURL()}${url}`
  if (url.startsWith('/')) return `${getAPIV1BaseURL()}${url}`
  return url
}

export function attachmentKind(mimeType: string, fallbackName = ''): AgentAttachment['type'] {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (/\.(heic|heif)$/i.test(fallbackName)) return 'image'
  if (mimeType.startsWith('text/') || /\.(txt|md|json|csv|srt)$/i.test(fallbackName)) return 'text'
  return 'file'
}

export function attachmentFromResource(resource: RawResource): AgentAttachment {
  return {
    id: `res-${resource.ID}`,
    name: resource.name,
    type: attachmentKind(resource.mime_type, resource.name),
    mimeType: resource.mime_type,
    size: resource.size,
    url: resourceUrl(resource),
    resourceId: resource.ID,
  }
}

export function attachmentKey(attachment: AgentAttachment): string {
  return attachment.resourceId !== undefined ? `resource:${attachment.resourceId}` : attachment.id
}

export function dedupeAttachments(items: AgentAttachment[]): AgentAttachment[] {
  const seen = new Map<string, AgentAttachment>()
  for (const item of items) {
    seen.set(attachmentKey(item), item)
  }
  return Array.from(seen.values())
}

export function placeholderAttachment(resourceId: number): AgentAttachment {
  return {
    id: `resource-${resourceId}`,
    name: `resource-${resourceId}`,
    type: 'file',
    mimeType: 'application/octet-stream',
    size: 0,
    resourceId,
  }
}
