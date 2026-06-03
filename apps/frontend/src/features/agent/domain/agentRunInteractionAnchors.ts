import { isTranscriptAssistantChatMessage, transcriptAssistantRelatedRunId } from '@/features/agent/domain/agentMessageBoundaries'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage } from '@/features/agent/state/agentStore'

export function buildInteractionRunsByResultMessageId({
  messages,
  interactionRuns,
}: {
  messages: ChatMessage[]
  interactionRuns: AgentRun[]
}): Map<string, AgentRun[]> {
  const interactionRunById = new Map(interactionRuns.map((interactionRun) => [interactionRun.id, interactionRun]))
  const insertedRunIds = new Set<string>()
  const runsByMessageId = new Map<string, AgentRun[]>()
  const messagesById = buildRunInteractionAnchorMessagesById(messages)

  for (const message of messages) {
    if (!isTranscriptAssistantChatMessage(message)) continue
    const runId = transcriptAssistantRelatedRunId(message)
    const interactionRun = runId ? interactionRunById.get(runId) : undefined
    if (!interactionRun || insertedRunIds.has(interactionRun.id)) continue
    insertInteractionRun(runsByMessageId, insertedRunIds, message.id, interactionRun)
  }

  for (const interactionRun of interactionRuns) {
    if (insertedRunIds.has(interactionRun.id)) continue
    const displayAnchorMessageId = runInteractionDisplayAnchorMessageId(interactionRun)
    const displayAnchorMessage = displayAnchorMessageId ? messagesById.get(displayAnchorMessageId) : undefined
    if (displayAnchorMessage) {
      insertInteractionRun(runsByMessageId, insertedRunIds, displayAnchorMessage.id, interactionRun)
      continue
    }
    const sourceMessageId = interactionRun.input?.sourceMessageId?.trim()
    const sourceMessage = sourceMessageId ? messagesById.get(sourceMessageId) : undefined
    if (!sourceMessage) continue
    insertInteractionRun(runsByMessageId, insertedRunIds, sourceMessage.id, interactionRun)
  }
  return runsByMessageId
}

function buildRunInteractionAnchorMessagesById(messages: ChatMessage[]): Map<string, ChatMessage> {
  const byId = new Map<string, ChatMessage>()
  for (const message of messages) {
    byId.set(message.id, message)
    const runtimeMessageId = message.meta?.runtimeMessage?.messageId?.trim()
    if (runtimeMessageId) byId.set(runtimeMessageId, message)
  }
  return byId
}

function runInteractionDisplayAnchorMessageId(interactionRun: AgentRun): string | undefined {
  for (const approval of interactionRun.pendingApprovals ?? []) {
    const messageId = approval.displayAnchor?.messageId
    if (typeof messageId === 'string' && messageId.trim()) return messageId.trim()
  }
  for (const request of interactionRun.pendingInputRequests ?? []) {
    const messageId = request.displayAnchor?.messageId
    if (typeof messageId === 'string' && messageId.trim()) return messageId.trim()
  }
  return undefined
}

function insertInteractionRun(
  runsByMessageId: Map<string, AgentRun[]>,
  insertedRunIds: Set<string>,
  messageId: string,
  interactionRun: AgentRun,
) {
  insertedRunIds.add(interactionRun.id)
  const runs = runsByMessageId.get(messageId) ?? []
  runs.push(interactionRun)
  runsByMessageId.set(messageId, runs)
}
