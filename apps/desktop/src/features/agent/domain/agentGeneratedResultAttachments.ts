import type { AgentAttachment } from '@/features/agent/state/agentStore'

export function isGeneratedResultAttachment(attachment: AgentAttachment) {
  return attachment.generated !== undefined || attachment.id.startsWith('generated-')
}
