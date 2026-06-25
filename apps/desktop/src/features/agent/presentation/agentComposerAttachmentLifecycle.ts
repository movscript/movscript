import { releaseAgentLocalFile } from '@/features/agent/application/agentLocalFileRegistry'
import type { AgentAttachment } from '@/features/agent/state/agentStore'

export function releaseLocalAttachmentSources(items: AgentAttachment[]) {
  for (const item of items) {
    releaseLocalAttachmentSource(item)
  }
}

export function releaseLocalAttachmentSource(attachment: AgentAttachment | undefined) {
  if (attachment?.source?.kind !== 'local_file') return
  releaseAgentLocalFile(attachment.source.fileId)
}
