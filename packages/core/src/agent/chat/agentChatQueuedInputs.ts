import type { AgentChatInput } from './agentChatThreadItems.js'

export type AgentChatQueuedInputStatus = 'draft' | 'editing' | 'sending' | 'failed'

export interface AgentChatQueuedInputPreviewItem {
  id: string
  text: string
  inputs: AgentChatInput[]
  status: AgentChatQueuedInputStatus
  error?: string | null
  createdAt: number
}

export function agentChatQueuedInputSummary(input: Pick<AgentChatQueuedInputPreviewItem, 'text' | 'inputs'>): string {
  const text = input.text.trim()
  if (text) return collapseWhitespace(text)
  const attachmentCount = input.inputs.filter((item) => item.type !== 'text').length
  if (attachmentCount > 0) return `${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`
  return 'Empty message'
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ')
}
