import { getAPIBaseURL } from '@/shared/infrastructure/config'
import type { AgentAttachment } from '@/features/agent/state/agentStore'
import type { RawResource } from '@/types'
import {
  resourceFileUrl,
  resolveResourceUrl as resolveCoreResourceUrl,
} from '@movscript/core/resources'

export function resourceUrl(resource: Pick<RawResource, 'url' | 'direct_url'>): string {
  const url = resource.direct_url || resource.url
  if (!url) return ''
  return resolveCoreResourceUrl({ url, direct_url: resource.direct_url }, getAPIBaseURL())
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
    source: { kind: 'backend_resource', resourceId: resource.ID },
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

export function stripAttachmentPreviewUrl(attachment: AgentAttachment): AgentAttachment {
  return { ...attachment, previewUrl: undefined, dataUrl: undefined }
}

export function placeholderAttachment(resourceId: number): AgentAttachment {
  return {
    id: `resource-${resourceId}`,
    name: `resource-${resourceId}`,
    type: 'file',
    mimeType: 'application/octet-stream',
    size: 0,
    resourceId,
    source: { kind: 'backend_resource', resourceId },
  }
}

export function attachmentDisplayUrl(attachment: AgentAttachment) {
  return attachment.previewUrl ?? attachment.url
}

export function attachmentToResource(attachment: AgentAttachment): RawResource | null {
  const url = attachmentDisplayUrl(attachment) || resourceFileUrl(attachment.resourceId) || ''
  if (!url) return null
  return {
    ID: attachment.resourceId ?? 0,
    owner_id: 0,
    type: attachment.type,
    name: attachment.name,
    url,
    size: attachment.size,
    mime_type: attachment.mimeType,
  }
}

export function formatAgentAttachmentBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}
