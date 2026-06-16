import { placeholderAttachment } from '@/features/agent/domain/agentAttachments'
import { buildCommandFirstClientInput } from '@/features/agent/domain/agentCommandInput'
import { prepareProviderSessionAttachmentRefs, providerSessionAttachmentRef } from '@movscript/core/agent'
import type { AgentAttachment } from '@/features/agent/state/agentStore'
import type { ProviderSessionClientInput } from '@/shared/infrastructure/providerSessionClient'

export function attachmentFromClientInputRef(attachment: NonNullable<ProviderSessionClientInput['attachments']>[number]): AgentAttachment {
  const type = attachment.type === 'image' || attachment.type === 'video' || attachment.type === 'audio' || attachment.type === 'text'
    ? attachment.type
    : 'file'
  return {
    id: attachment.id ?? (attachment.resourceId !== undefined ? `res-${attachment.resourceId}` : `${attachment.name ?? 'attachment'}-${Math.random().toString(36).slice(2, 8)}`),
    name: attachment.name ?? `resource-${attachment.resourceId ?? 'attachment'}`,
    type,
    mimeType: attachment.mimeType ?? 'application/octet-stream',
    size: attachment.size ?? 0,
    ...(attachment.resourceId !== undefined ? { resourceId: attachment.resourceId } : {}),
    ...(attachment.dataUrl ? { dataUrl: attachment.dataUrl } : {}),
    ...(attachment.url ? { url: attachment.url } : {}),
    ...(attachment.source ? { source: attachment.source } : {}),
  }
}

export function resourceMentionAttachments(text: string, byId: Map<number, AgentAttachment>): AgentAttachment[] {
  return parseResourceMentionIds(text).map((resourceId) => byId.get(resourceId) ?? placeholderAttachment(resourceId))
}

export function buildProviderSessionClientInput(options: {
  message: string
  attachments?: AgentAttachment[]
  attachmentRefs?: NonNullable<ProviderSessionClientInput['attachments']>
  projectId?: number
  labels?: string[]
  route?: { pathname?: string; search?: string; hash?: string }
  productionId?: number
  workspaceId?: string
  selection?: { entityType?: string; entityId?: number | string; label?: string } | null
}): ProviderSessionClientInput {
  return buildCommandFirstClientInput({
    message: options.message,
    attachments: options.attachmentRefs ?? (options.attachments ?? []).map(providerSessionAttachmentToClientInputRef),
    labels: options.labels,
    hints: {
      ...(options.projectId ? { projectId: options.projectId } : {}),
      ...(options.productionId ? { productionId: options.productionId } : {}),
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      ...(options.selection ? { selection: options.selection } : {}),
      ...(options.route ? { route: options.route } : {}),
    },
  })
}

export async function resolveProviderSessionClientAttachmentRefs(
  attachments: AgentAttachment[],
  resolveDataUrl?: (attachment: AgentAttachment) => Promise<string | undefined>,
  onWarning?: (warning: string) => void,
): Promise<NonNullable<ProviderSessionClientInput['attachments']>> {
  return prepareProviderSessionAttachmentRefs(attachments, {
    resolver: resolveDataUrl
      ? {
          resolveDataUrl: ({ attachment }) => resolveDataUrl(attachment),
        }
      : undefined,
    onWarning,
  })
}

export function attachmentPromptBlock(attachments: AgentAttachment[]) {
  if (attachments.length === 0) return ''
  const lines = attachments.map((attachment, index) => {
    const id = attachment.resourceId ? `resource_id=${attachment.resourceId}` : 'local_preview'
    const payload = attachment.dataUrl ? ', image_payload=data_url' : attachment.type === 'video' ? ', video_payload=metadata_only' : ''
    return `${index + 1}. ${attachment.name} (${attachment.type}, ${attachment.mimeType || 'unknown'}, ${formatBytesForPrompt(attachment.size)}, ${id}${payload})`
  })
  return `\n\n[用户随消息提供的附件]\n${lines.join('\n')}\n图片附件会先由提供方会话预处理，优化后的图片 payload 会优先进入 vision 模型上下文；预处理不可用或失败时回退发送原始图片 payload。视频附件只提供 resource_id 元数据，需要 agent 用抽帧工具读取代表帧。其他附件只提供元数据。`
}

function parseResourceMentionIds(text: string): number[] {
  const ids: number[] = []
  const seen = new Set<number>()
  for (const match of text.matchAll(/@\[resource:(\d+)\]/g)) {
    const id = Number(match[1])
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function providerSessionAttachmentToClientInputRef(attachment: AgentAttachment): NonNullable<ProviderSessionClientInput['attachments']>[number] {
  return providerSessionAttachmentRef(attachment)
}

function formatBytesForPrompt(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
