import { isWorkflowAnswerEchoMessage, workflowRunFromActivity } from '@/lib/agentWorkflowInteraction'
import type { AgentRun } from '@/lib/localAgentClient'
import type { ChatMessage } from '@/store/agentStore'

export interface AgentConversationMessageItem {
  beforeMessageWorkflowRuns: AgentRun[]
  afterMessageWorkflowRuns: AgentRun[]
  liveWorkflowRuns: AgentRun[] | null
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

export function buildAgentConversationMessageItems({
  messages,
  workflowAnswerEchoes,
  workflowRunsByResultMessageId,
  suppressedWorkflowRunIds = new Set(),
}: {
  messages: ChatMessage[]
  workflowAnswerEchoes: Set<string>
  workflowRunsByResultMessageId: Map<string, AgentRun[]>
  suppressedWorkflowRunIds?: Set<string>
}): AgentConversationMessageItem[] {
  return messages.flatMap((message) => {
    if (isWorkflowAnswerEchoMessage(message, workflowAnswerEchoes)) return []
    if (message.meta?.planRevision) return []
    const mappedWorkflowRuns = workflowRunsByResultMessageId.get(message.id) ?? null
    const liveWorkflowRuns = mappedWorkflowRuns
      ?.filter((run) => !suppressedWorkflowRunIds.has(run.id)) ?? null
    const historicalWorkflowRun = mappedWorkflowRuns ? null : workflowRunFromActivity(message.meta?.localRunActivity)
    const visibleHistoricalWorkflowRun = historicalWorkflowRun
      && !suppressedWorkflowRunIds.has(historicalWorkflowRun.id)
      ? historicalWorkflowRun
      : null
    const workflowRuns = liveWorkflowRuns ?? (visibleHistoricalWorkflowRun ? [visibleHistoricalWorkflowRun] : [])
    const beforeMessageWorkflowRuns: AgentRun[] = []
    const afterMessageWorkflowRuns: AgentRun[] = []
    for (const run of workflowRuns) {
      if (workflowRunBelongsAfterMessage(run, message)) afterMessageWorkflowRuns.push(run)
      else beforeMessageWorkflowRuns.push(run)
    }
    return [{
      beforeMessageWorkflowRuns,
      afterMessageWorkflowRuns,
      liveWorkflowRuns,
      message,
      showMessage: true,
    }]
  })
}

export function buildAgentConversationThreadItems(input: {
  messages: ChatMessage[]
  workflowAnswerEchoes: Set<string>
  workflowRunsByResultMessageId: Map<string, AgentRun[]>
  suppressedWorkflowRunIds?: Set<string>
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

function workflowRunBelongsAfterMessage(run: AgentRun, message: ChatMessage): boolean {
  return message.role === 'user'
}

export function buildPendingRuntimeInputQueueItems(messages: ChatMessage[]): AgentPendingRuntimeInputQueueItem[] {
  return messages
    .filter(isPendingRuntimeInputMessage)
    .map((message) => ({
      id: message.id,
      ...(message.meta?.runtimeInput?.runId?.trim() ? { runId: message.meta.runtimeInput.runId.trim() } : {}),
      content: message.content,
      timestamp: message.timestamp,
    }))
}

function isPendingRuntimeInputMessage(message: ChatMessage): boolean {
  return message.role === 'user'
    && message.meta?.runtimeInput?.status === 'pending'
    && !message.meta.runtimeMessage?.messageId
}

function runGroupIdForMessage(message: ChatMessage): string | undefined {
  if (message.role === 'user') {
    return userMessageRunId(message)
  }
  return normalizeRunId(message.meta?.runtimeMessage?.runId)
    ?? normalizeRunId(message.meta?.localRunActivity?.runId)
}

function userMessageRunId(message: ChatMessage): string | undefined {
  if (message.role !== 'user') return undefined
  return normalizeRunId(message.meta?.runtimeInput?.runId)
    ?? normalizeRunId(message.meta?.runtimeMessage?.runId)
}

function normalizeRunId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
