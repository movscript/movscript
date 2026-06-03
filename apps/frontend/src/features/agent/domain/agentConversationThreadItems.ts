import { isRunInteractionAnswerEchoMessage, runInteractionFromActivity } from '@/features/agent/domain/agentRunInteraction'
import {
  isUiOnlyAssistantChatMessage,
  visibleAssistantActivityRunId,
  visibleAssistantRelatedRunId,
} from '@/features/agent/domain/agentMessageBoundaries'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage } from '@/features/agent/state/agentStore'

export interface AgentConversationMessageItem {
  beforeMessageInteractionRuns: AgentRun[]
  afterMessageInteractionRuns: AgentRun[]
  liveInteractionRuns: AgentRun[] | null
  message: ChatMessage
  showMessage: boolean
}

export type AgentConversationThreadItem =
  | {
    id: string
    type: 'message'
    item: AgentConversationMessageItem
  }
  | {
    id: string
    type: 'run_group'
    runId: string
    items: AgentConversationMessageItem[]
  }

export interface AgentPendingRuntimeInputQueueItem {
  id: string
  runId?: string
  content: string
  timestamp: number
}

export function splitRunGroupItemsForLiveBlocks(items: AgentConversationMessageItem[]): {
  beforeLiveBlocks: AgentConversationMessageItem[]
  afterLiveBlocks: AgentConversationMessageItem[]
} {
  return {
    beforeLiveBlocks: items.filter((item) => item.message.role === 'user'),
    afterLiveBlocks: items.filter((item) => item.message.role !== 'user'),
  }
}

export function buildAgentConversationMessageItems({
  messages,
  runInteractionAnswerEchoes,
  interactionRunsByResultMessageId,
  suppressedInteractionRunIds = new Set(),
}: {
  messages: ChatMessage[]
  runInteractionAnswerEchoes: Set<string>
  interactionRunsByResultMessageId: Map<string, AgentRun[]>
  suppressedInteractionRunIds?: Set<string>
}): AgentConversationMessageItem[] {
  return messages.flatMap((message) => {
    if (isRunInteractionAnswerEchoMessage(message, runInteractionAnswerEchoes)) return []
    if (isUiOnlyAssistantChatMessage(message)) return []
    const mappedInteractionRuns = interactionRunsByResultMessageId.get(message.id) ?? null
    const liveInteractionRuns = mappedInteractionRuns
      ?.filter((run) => !suppressedInteractionRunIds.has(run.id)) ?? null
    const historicalInteractionRun = mappedInteractionRuns || message.role === 'assistant' ? null : runInteractionFromActivity(message.meta?.localRunActivity)
    const visibleHistoricalInteractionRun = historicalInteractionRun
      && !suppressedInteractionRunIds.has(historicalInteractionRun.id)
      ? historicalInteractionRun
      : null
    const interactionRuns = liveInteractionRuns ?? (visibleHistoricalInteractionRun ? [visibleHistoricalInteractionRun] : [])
    const beforeMessageInteractionRuns: AgentRun[] = []
    const afterMessageInteractionRuns: AgentRun[] = []
    for (const run of interactionRuns) {
      if (interactionRunBelongsAfterMessage(run, message)) afterMessageInteractionRuns.push(run)
      else beforeMessageInteractionRuns.push(run)
    }
    return [{
      beforeMessageInteractionRuns,
      afterMessageInteractionRuns,
      liveInteractionRuns,
      message,
      showMessage: true,
    }]
  })
}

export function buildAgentConversationThreadItems(input: {
  messages: ChatMessage[]
  runInteractionAnswerEchoes: Set<string>
  interactionRunsByResultMessageId: Map<string, AgentRun[]>
  suppressedInteractionRunIds?: Set<string>
}): AgentConversationThreadItem[] {
  const messageItems = buildAgentConversationMessageItems(input)
  const groupsByRunId = new Map<string, Extract<AgentConversationThreadItem, { type: 'run_group' }>>()
  const threadItems: AgentConversationThreadItem[] = []
  const seenUserRunIds = new Set<string>()

  for (const item of messageItems) {
    if (isPendingRuntimeInputMessage(item.message)) continue
    const userRunId = userMessageRunId(item.message)
    if (userRunId && !seenUserRunIds.has(userRunId)) {
      seenUserRunIds.add(userRunId)
      threadItems.push({
        id: `message:${item.message.id}`,
        type: 'message',
        item,
      })
      continue
    }
    if (userRunId) seenUserRunIds.add(userRunId)
    const groupRunId = runGroupIdForMessage(item.message)
    if (!groupRunId) {
      threadItems.push({
        id: `message:${item.message.id}`,
        type: 'message',
        item,
      })
      continue
    }

    let group = groupsByRunId.get(groupRunId)
    if (!group) {
      group = {
        id: `run-group:${groupRunId}`,
        type: 'run_group',
        runId: groupRunId,
        items: [],
      }
      groupsByRunId.set(groupRunId, group)
      threadItems.push(group)
    }
    group.items.push(item)
  }

  return threadItems.filter((item) => item.type === 'message' || item.items.length > 0)
}

function interactionRunBelongsAfterMessage(run: AgentRun, message: ChatMessage): boolean {
  const placement = runInteractionAnchorPlacement(run, message)
  if (placement === 'before') return false
  if (placement === 'after') return true
  return message.role === 'user'
}

function runInteractionAnchorPlacement(run: AgentRun, message: ChatMessage): 'before' | 'after' | undefined {
  const messageIds = new Set([
    message.id,
    normalizeRunId(message.meta?.runtimeMessage?.messageId),
  ].filter((id): id is string => Boolean(id)))
  for (const approval of run.pendingApprovals ?? []) {
    const anchor = approval.displayAnchor
    if (anchor?.placement !== 'before' && anchor?.placement !== 'after') continue
    if (typeof anchor.messageId === 'string' && messageIds.has(anchor.messageId.trim())) return anchor.placement
  }
  for (const request of run.pendingInputRequests ?? []) {
    const anchor = request.displayAnchor
    if (anchor?.placement !== 'before' && anchor?.placement !== 'after') continue
    if (typeof anchor.messageId === 'string' && messageIds.has(anchor.messageId.trim())) return anchor.placement
  }
  return undefined
}

export function buildPendingRuntimeInputQueueItems(messages: ChatMessage[]): AgentPendingRuntimeInputQueueItem[] {
  return messages
    .filter(runtimeInputIsWaitingForDelivery)
    .map((message) => ({
      id: message.id,
      ...(message.meta?.runtimeInput?.runId?.trim() ? { runId: message.meta.runtimeInput.runId.trim() } : {}),
      content: message.content,
      timestamp: message.timestamp,
    }))
}

export function runtimeInputDisplayStatus(message: Pick<ChatMessage, 'meta'>): NonNullable<NonNullable<ChatMessage['meta']>['runtimeInput']>['status'] | undefined {
  const runtimeInput = message.meta?.runtimeInput
  if (!runtimeInput) return undefined
  if (
    runtimeInput.status === 'pending'
    && (runtimeInput.messageId?.trim() || message.meta?.runtimeMessage?.messageId?.trim())
  ) {
    return 'accepted'
  }
  return runtimeInput.status
}

export function runtimeInputIsWaitingForDelivery(message: ChatMessage): boolean {
  return message.role === 'user'
    && runtimeInputDisplayStatus(message) === 'pending'
    && !message.meta?.runtimeMessage?.messageId
}

export function runIdsWithActivityMessages(messages: ChatMessage[]): Set<string> {
  const runIds = new Set<string>()
  for (const message of messages) {
    const runId = visibleAssistantActivityRunId(message)
    if (runId) runIds.add(runId)
  }
  return runIds
}

function isPendingRuntimeInputMessage(message: ChatMessage): boolean {
  return runtimeInputIsWaitingForDelivery(message)
}

function runGroupIdForMessage(message: ChatMessage): string | undefined {
  if (message.role === 'user') {
    return userMessageRunId(message)
  }
  return visibleAssistantRelatedRunId(message)
}

function userMessageRunId(message: ChatMessage): string | undefined {
  if (message.role !== 'user') return undefined
  return normalizeRunId(message.meta?.runtimeInput?.runId)
    ?? normalizeRunId(message.meta?.runtimeMessage?.runId)
}

function normalizeRunId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
