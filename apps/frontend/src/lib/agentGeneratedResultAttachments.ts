import type { AgentAttachment } from '@/store/agentStore'

export function isGeneratedResultAttachment(attachment: AgentAttachment) {
  return attachment.generated !== undefined || attachment.id.startsWith('generated-')
}
