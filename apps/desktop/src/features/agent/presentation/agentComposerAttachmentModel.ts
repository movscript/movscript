import { resourceIdsFromMentions } from '@movscript/workspace'
import type { AgentAttachment } from '@/features/agent/state/agentStore'
import type { RawResource } from '@/types'
import {
  attachmentFromResource,
  attachmentKey,
  placeholderAttachment,
} from '@/features/agent/domain/agentAttachments'

export interface AgentComposerAttachmentEntry {
  attachment: AgentAttachment
  explicit: boolean
  mentioned: boolean
}

export interface AgentMentionRange {
  start: number
  end: number
  query: string
}

export function buildResourceAttachmentIndex(
  attachments: AgentAttachment[],
  recentResources: RawResource[],
): Map<number, AgentAttachment> {
  const map = new Map<number, AgentAttachment>()
  for (const attachment of attachments) {
    if (attachment.resourceId !== undefined) map.set(attachment.resourceId, attachment)
  }
  for (const resource of recentResources) {
    if (!map.has(resource.ID)) map.set(resource.ID, attachmentFromResource(resource))
  }
  return map
}

export function mentionedResourceIdsFromInput(input: string): Set<number> {
  return new Set(resourceIdsFromMentions(input))
}

export function buildMentionCandidates(
  attachments: AgentAttachment[],
  recentResources: RawResource[],
): AgentAttachment[] {
  const map = new Map<number, AgentAttachment>()
  for (const resource of recentResources) {
    map.set(resource.ID, attachmentFromResource(resource))
  }
  for (const attachment of attachments) {
    if (attachment.resourceId !== undefined) map.set(attachment.resourceId, attachment)
  }
  return Array.from(map.values()).filter((attachment) =>
    attachment.resourceId !== undefined
    && (attachment.type === 'image' || attachment.type === 'video' || attachment.type === 'audio')
  )
}

export function buildComposerAttachmentEntries({
  attachments,
  mentionedResourceIds,
  resourceAttachmentIndex,
}: {
  attachments: AgentAttachment[]
  mentionedResourceIds: Set<number>
  resourceAttachmentIndex: Map<number, AgentAttachment>
}): AgentComposerAttachmentEntry[] {
  const map = new Map<string, AgentComposerAttachmentEntry>()
  for (const attachment of attachments) {
    map.set(attachmentKey(attachment), { attachment, explicit: true, mentioned: false })
  }
  for (const resourceId of mentionedResourceIds) {
    const attachment = resourceAttachmentIndex.get(resourceId) ?? placeholderAttachment(resourceId)
    const key = attachmentKey(attachment)
    const existing = map.get(key)
    map.set(key, existing
      ? { ...existing, mentioned: true, attachment: existing.attachment.resourceId !== undefined ? existing.attachment : attachment }
      : { attachment, explicit: false, mentioned: true })
  }
  return Array.from(map.values())
}

export function sameAgentMentionRange(
  current: AgentMentionRange | null,
  next: AgentMentionRange,
): boolean {
  return !!current
    && current.start === next.start
    && current.end === next.end
    && current.query === next.query
}
