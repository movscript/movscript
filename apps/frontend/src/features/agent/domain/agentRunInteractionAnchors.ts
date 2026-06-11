import { isTranscriptAssistantChatMessage, transcriptAssistantRelatedRunId } from '@/features/agent/domain/agentMessageBoundaries'
import { providerSessionMessageRef } from '@movscript/core/agent/protocol'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { ChatMessage } from '@/features/agent/state/agentStore'

export type AgentRunInteractionDisplayAnchorPlacement = 'before' | 'after'

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
    const sourceMessageId = normalizeId(interactionRun.input?.sourceMessageId)
    const sourceMessage = sourceMessageId ? messagesById.get(sourceMessageId) : undefined
    if (!sourceMessage) continue
    insertInteractionRun(runsByMessageId, insertedRunIds, sourceMessage.id, interactionRun)
  }
  return runsByMessageId
}

export function runInteractionDisplayAnchorPlacementForMessage(
  interactionRun: AgentRun,
  message: ChatMessage,
): AgentRunInteractionDisplayAnchorPlacement | undefined {
  const messageIds = runInteractionAnchorMessageIds(message)
  for (const anchor of runInteractionDisplayAnchors(interactionRun)) {
    if (!anchor.placement) continue
    if (messageIds.has(anchor.messageId)) return anchor.placement
  }
  return undefined
}

export function runInteractionPlacementForMessage(
  interactionRun: AgentRun,
  message: ChatMessage,
): AgentRunInteractionDisplayAnchorPlacement {
  return runInteractionDisplayAnchorPlacementForMessage(interactionRun, message)
    ?? (message.role === 'user' ? 'after' : 'before')
}

function buildRunInteractionAnchorMessagesById(messages: ChatMessage[]): Map<string, ChatMessage> {
  const byId = new Map<string, ChatMessage>()
  for (const message of messages) {
    byId.set(message.id, message)
    const providerSessionMessageId = providerSessionMessageRef(message)?.messageId?.trim()
    if (providerSessionMessageId) byId.set(providerSessionMessageId, message)
  }
  return byId
}

function runInteractionDisplayAnchorMessageId(interactionRun: AgentRun): string | undefined {
  return runInteractionDisplayAnchors(interactionRun)[0]?.messageId
}

function runInteractionDisplayAnchors(interactionRun: AgentRun): Array<{
  messageId: string
  placement?: AgentRunInteractionDisplayAnchorPlacement
}> {
  return [
    ...(interactionRun.pendingApprovals ?? []).map((approval) => approval.displayAnchor),
    ...(interactionRun.pendingInputRequests ?? []).map((request) => request.displayAnchor),
  ].flatMap((anchor) => {
    const messageId = normalizeId(anchor?.messageId)
    if (!messageId) return []
    return [{
      messageId,
      ...(anchor?.placement === 'before' || anchor?.placement === 'after'
        ? { placement: anchor.placement }
        : {}),
    }]
  })
}

function runInteractionAnchorMessageIds(message: ChatMessage): Set<string> {
  return new Set([
    message.id,
    normalizeId(providerSessionMessageRef(message)?.messageId),
  ].filter((id): id is string => Boolean(id)))
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

function normalizeId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
