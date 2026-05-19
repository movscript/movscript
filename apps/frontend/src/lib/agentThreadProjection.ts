import { assistantResultPayloadForRun, type AgentMessageViewModelDeps } from '@/lib/agentMessageViewModel'
import { attachmentKind } from '@/lib/agentAttachments'
import { formatLocalAgentAssistantContent } from '@/lib/localAgentResult'
import { isRecord } from '@/lib/jsonValue'
import type { AgentMessage, AgentRun, AgentThread } from '@/lib/localAgentClient'
import type { AgentAttachment, ChatMessage, ChatMessageMeta, ChatRunActivityEvent } from '@/store/agentStore'

export interface RuntimeThreadProjectionInput {
  thread: AgentThread
  runs?: AgentRun[]
  existingMessages?: ChatMessage[]
  liveEventsByRunId?: Record<string, ChatRunActivityEvent[]>
  deps?: AgentMessageViewModelDeps
}

export async function projectRuntimeThreadMessages(input: RuntimeThreadProjectionInput): Promise<ChatMessage[]> {
  const runs = [...(input.runs ?? [])].filter(isTopLevelUserFacingRun)
  const existingByRuntimeMessageId = existingRuntimeMessageMap(input.existingMessages ?? [], input.thread.id)
  const existingAssistantByRuntimeRunId = existingAssistantRuntimeRunMap(input.existingMessages ?? [], input.thread.id)
  const runsBySourceMessageId = new Map<string, AgentRun>()
  const runsByAssistantMessageId = new Map<string, AgentRun>()
  const runsById = new Map<string, AgentRun>()
  for (const run of runs) {
    runsById.set(run.id, run)
    if (run.input?.sourceMessageId) runsBySourceMessageId.set(run.input.sourceMessageId, run)
    if (run.assistantMessageId) runsByAssistantMessageId.set(run.assistantMessageId, run)
  }

  const projectedAssistantRunIds = new Set<string>()
  const messages: ChatMessage[] = []
  for (const message of [...input.thread.messages].sort(compareRuntimeMessages)) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    const run = message.role === 'user'
      ? runsBySourceMessageId.get(message.id)
      : runsByAssistantMessageId.get(message.id) ?? (message.runId ? runsById.get(message.runId) : undefined)
    if (message.role === 'assistant' && run) projectedAssistantRunIds.add(run.id)
    messages.push(await projectRuntimeMessage({
      message,
      run,
      existing: existingByRuntimeMessageId.get(message.id),
      liveEvents: run ? input.liveEventsByRunId?.[run.id] : undefined,
      deps: input.deps,
    }))
  }

  for (const run of runs.sort(compareRuns)) {
    if (projectedAssistantRunIds.has(run.id)) continue
    const content = formatLocalAgentAssistantContent(run, input.thread)
    const existing = existingAssistantByRuntimeRunId.get(run.id)
    const payload = await assistantResultPayloadForRun(run, input.liveEventsByRunId?.[run.id] ?? [], content, input.deps)
    messages.push({
      id: existing?.id ?? `runtime-run:${run.id}:assistant`,
      role: 'assistant',
      content,
      attachments: payload.attachments ?? existing?.attachments,
      meta: {
        ...existing?.meta,
        ...payload.meta,
      },
      timestamp: runtimeTimestamp(run.completedAt ?? run.failedAt ?? run.cancelledAt ?? run.updatedAt ?? run.createdAt),
    })
  }

  return messages.sort((a, b) => a.timestamp - b.timestamp)
}

export function mergeProjectedRuntimeMessages(existingMessages: ChatMessage[], projectedMessages: ChatMessage[], threadId: string): ChatMessage[] {
  return [
    ...existingMessages.filter((message) => message.meta?.runtimeMessage?.threadId !== threadId),
    ...projectedMessages,
  ].sort((a, b) => a.timestamp - b.timestamp)
}

async function projectRuntimeMessage(input: {
  message: AgentMessage
  run?: AgentRun
  existing?: ChatMessage
  liveEvents?: ChatRunActivityEvent[]
  deps?: AgentMessageViewModelDeps
}): Promise<ChatMessage> {
  const timestamp = runtimeTimestamp(input.message.createdAt)
  const baseMeta: ChatMessageMeta = {
    ...input.existing?.meta,
    runtimeMessage: {
      threadId: input.message.threadId,
      messageId: input.message.id,
      ...(input.run ? { runId: input.run.id } : {}),
    },
  }
  if (input.message.role === 'assistant' && input.run) {
    const payload = await assistantResultPayloadForRun(input.run, input.liveEvents ?? [], input.message.content, input.deps)
    return {
      id: input.existing?.id ?? `runtime:${input.message.id}`,
      role: 'assistant',
      content: input.message.content,
      attachments: payload.attachments ?? input.existing?.attachments,
      meta: {
        ...baseMeta,
        ...payload.meta,
        runtimeMessage: baseMeta.runtimeMessage,
      },
      timestamp,
    }
  }
  return {
    id: input.existing?.id ?? `runtime:${input.message.id}`,
    role: input.message.role === 'assistant' ? 'assistant' : 'user',
    content: input.message.content,
    attachments: input.existing?.attachments ?? attachmentsFromClientInput(input.message.clientInput),
    meta: baseMeta,
    timestamp,
  }
}

function attachmentsFromClientInput(clientInput: unknown): AgentAttachment[] | undefined {
  if (!isRecord(clientInput) || !Array.isArray(clientInput.attachments)) return undefined
  const attachments = clientInput.attachments
    .filter(isRecord)
    .map((attachment, index): AgentAttachment => {
      const name = typeof attachment.name === 'string' && attachment.name.trim() ? attachment.name.trim() : `attachment-${index + 1}`
      const mimeType = typeof attachment.mimeType === 'string' && attachment.mimeType.trim() ? attachment.mimeType.trim() : 'application/octet-stream'
      const resourceId = typeof attachment.resourceId === 'number' && Number.isFinite(attachment.resourceId) ? attachment.resourceId : undefined
      return {
        id: typeof attachment.id === 'string' && attachment.id.trim()
          ? attachment.id.trim()
          : resourceId !== undefined ? `resource-${resourceId}` : `runtime-attachment-${index + 1}`,
        name,
        type: attachmentKind(mimeType, name),
        mimeType,
        size: typeof attachment.size === 'number' && Number.isFinite(attachment.size) ? attachment.size : 0,
        ...(resourceId !== undefined ? { resourceId } : {}),
      }
    })
  return attachments.length > 0 ? attachments : undefined
}

function existingRuntimeMessageMap(messages: ChatMessage[], threadId: string): Map<string, ChatMessage> {
  const byRuntimeId = new Map<string, ChatMessage>()
  for (const message of messages) {
    const runtime = message.meta?.runtimeMessage
    if (runtime?.threadId !== threadId || !runtime.messageId) continue
    byRuntimeId.set(runtime.messageId, message)
  }
  return byRuntimeId
}

function existingAssistantRuntimeRunMap(messages: ChatMessage[], threadId: string): Map<string, ChatMessage> {
  const byRunId = new Map<string, ChatMessage>()
  for (const message of messages) {
    const runtime = message.meta?.runtimeMessage
    if (message.role !== 'assistant' || runtime?.threadId !== threadId || !runtime.runId) continue
    byRunId.set(runtime.runId, message)
  }
  return byRunId
}

function isTopLevelUserFacingRun(run: AgentRun): boolean {
  return run.role !== 'worker' && !run.parentRunId
}

function compareRuntimeMessages(a: AgentMessage, b: AgentMessage): number {
  return runtimeTimestamp(a.createdAt) - runtimeTimestamp(b.createdAt)
}

function compareRuns(a: AgentRun, b: AgentRun): number {
  return runtimeTimestamp(a.createdAt) - runtimeTimestamp(b.createdAt)
}

function runtimeTimestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}
