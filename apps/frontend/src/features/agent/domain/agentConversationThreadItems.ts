import { isRunInteractionAnswerEchoMessage, runInteractionFromActivity } from '@/features/agent/domain/agentRunInteraction'
import {
  transcriptAssistantRelatedRunId,
} from '@/features/agent/domain/agentMessageBoundaries'
import type { AgentRun, AgentTimelineItem } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage, ChatRunActivity } from '@/features/agent/state/agentStore'

export interface AgentTranscriptMessageItem {
  beforeMessageInteractionRuns: AgentRun[]
  afterMessageInteractionRuns: AgentRun[]
  liveInteractionRuns: AgentRun[] | null
  message: ChatMessage
  showMessage: boolean
  timelineActivity?: ChatRunActivity
}

export type AgentConversationThreadItem =
  | {
    id: string
    type: 'message'
    item: AgentTranscriptMessageItem
  }
  | {
    id: string
    type: 'run_group'
    runId: string
    items: AgentTranscriptMessageItem[]
  }

export interface AgentPendingRuntimeInputQueueItem {
  id: string
  runId?: string
  content: string
  timestamp: number
}

export function splitRunGroupItemsForLiveBlocks(items: AgentTranscriptMessageItem[]): {
  beforeLiveBlocks: AgentTranscriptMessageItem[]
  afterLiveBlocks: AgentTranscriptMessageItem[]
} {
  return {
    beforeLiveBlocks: items.filter((item) => item.message.role === 'user'),
    afterLiveBlocks: items.filter((item) => item.message.role !== 'user'),
  }
}

export function buildAgentTranscriptMessageItems({
  transcriptMessages,
  runInteractionAnswerEchoes,
  interactionRunsByResultMessageId,
  suppressedInteractionRunIds = new Set(),
  timelineItems = [],
}: {
  transcriptMessages: ChatMessage[]
  runInteractionAnswerEchoes: Set<string>
  interactionRunsByResultMessageId: Map<string, AgentRun[]>
  suppressedInteractionRunIds?: Set<string>
  timelineItems?: AgentTimelineItem[]
}): AgentTranscriptMessageItem[] {
  const activityByMessageId = timelineActivityByMessageId(timelineItems)
  return transcriptMessages.flatMap((message) => {
    if (isRunInteractionAnswerEchoMessage(message, runInteractionAnswerEchoes)) return []
    const timelineActivity = activityByMessageId.get(message.id)
    const mappedInteractionRuns = interactionRunsByResultMessageId.get(message.id) ?? null
    const liveInteractionRuns = mappedInteractionRuns
      ?.filter((run) => !suppressedInteractionRunIds.has(run.id)) ?? null
    const historicalInteractionRun = mappedInteractionRuns || message.role === 'assistant' ? null : runInteractionFromActivity(timelineActivity)
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
      ...(timelineActivity ? { timelineActivity } : {}),
    }]
  })
}

export function buildAgentConversationThreadItems(input: {
  transcriptMessages: ChatMessage[]
  runInteractionAnswerEchoes: Set<string>
  interactionRunsByResultMessageId: Map<string, AgentRun[]>
  suppressedInteractionRunIds?: Set<string>
  timelineItems?: AgentTimelineItem[]
}): AgentConversationThreadItem[] {
  const transcriptMessageItems = buildAgentTranscriptMessageItems(input)
  const groupsByRunId = new Map<string, Extract<AgentConversationThreadItem, { type: 'run_group' }>>()
  const threadItems: AgentConversationThreadItem[] = []
  const seenUserRunIds = new Set<string>()

  for (const item of transcriptMessageItems) {
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
    const groupRunId = runGroupIdForMessageItem(item)
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

export function runtimeInputDisplayDeliveryStatus(message: Pick<ChatMessage, 'meta'>): NonNullable<NonNullable<ChatMessage['meta']>['runtimeInput']>['deliveryStatus'] | undefined {
  const runtimeInput = message.meta?.runtimeInput
  if (!runtimeInput) return undefined
  if (
    runtimeInput.deliveryStatus === 'pending'
    && (runtimeInput.messageId?.trim() || message.meta?.runtimeMessage?.messageId?.trim())
  ) {
    return 'accepted'
  }
  return runtimeInput.deliveryStatus
}

export function runtimeInputIsWaitingForDelivery(message: ChatMessage): boolean {
  return message.role === 'user'
    && runtimeInputDisplayDeliveryStatus(message) === 'pending'
    && !message.meta?.runtimeMessage?.messageId
}

export function runIdsWithTimelineActivityItems(timelineItems: AgentTimelineItem[]): Set<string> {
  const runIds = new Set<string>()
  for (const item of timelineItems) {
    const runId = normalizeRunId(item.activity?.runId)
    if (runId) runIds.add(runId)
  }
  return runIds
}

function isPendingRuntimeInputMessage(message: ChatMessage): boolean {
  return runtimeInputIsWaitingForDelivery(message)
}

function runGroupIdForMessageItem(item: AgentTranscriptMessageItem): string | undefined {
  const message = item.message
  if (message.role === 'user') {
    return userMessageRunId(message)
  }
  return transcriptAssistantRelatedRunId(message)
    ?? normalizeRunId(item.timelineActivity?.runId)
}

function timelineActivityByMessageId(timelineItems: AgentTimelineItem[]): Map<string, ChatRunActivity> {
  const byMessageId = new Map<string, ChatRunActivity>()
  for (const item of timelineItems) {
    if (item.activity) byMessageId.set(item.id, item.activity)
  }
  return byMessageId
}

function userMessageRunId(message: ChatMessage): string | undefined {
  if (message.role !== 'user') return undefined
  return normalizeRunId(message.meta?.runtimeInput?.runId)
    ?? normalizeRunId(message.meta?.runtimeMessage?.runId)
}

function normalizeRunId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
