import type { CandidateResourceRef } from '@movscript/resource-surface/resource-candidate-attach-panel'
import { generatedAttachmentResourceId } from '@/features/agent/domain/agentGeneratedResourceBinding'
import type { AgentAttachment } from '@/features/agent/state/agentStore'

export function candidateResourceFromGeneratedAttachment(attachment: AgentAttachment): CandidateResourceRef {
  return {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    resourceId: generatedAttachmentResourceId(attachment),
    sourceJobId: attachment.generated?.jobId,
  }
}

export function generatedResultBreadcrumb(attachment: AgentAttachment, resourceId: number | undefined) {
  return [
    resourceId !== undefined ? `资源 #${resourceId}` : '未返回资源 ID',
    generatedAttachmentTypeLabel(attachment.type),
    attachment.generated?.modelDisplay ?? attachment.generated?.modelIdentifier,
  ].filter(Boolean).join(' · ')
}

export function generatedResultDetailTitle(attachment: AgentAttachment, resourceId: number | undefined) {
  return [
    resourceId !== undefined ? `资源 #${resourceId}` : '未返回资源 ID',
    generatedAttachmentTypeLabel(attachment.type),
    attachment.mimeType,
    attachment.size ? formatBytes(attachment.size) : undefined,
    attachment.generated?.jobId !== undefined ? `Job #${attachment.generated.jobId}` : undefined,
    attachment.generated?.jobType,
    attachment.generated?.providerName,
    attachment.generated?.modelDisplay ?? attachment.generated?.modelIdentifier,
    attachment.generated?.status,
    attachment.generated?.stage,
  ].filter(Boolean).join(' · ')
}

export function generatedAttachmentTypeLabel(type: AgentAttachment['type']) {
  if (type === 'image') return '图片'
  if (type === 'video') return '视频'
  if (type === 'audio') return '音频'
  if (type === 'text') return '文本'
  return '文件'
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}
